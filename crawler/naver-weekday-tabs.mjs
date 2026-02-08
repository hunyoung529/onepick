import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqBy(items, keyFn) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    if (!map.has(k)) map.set(k, it);
  }
  return Array.from(map.values());
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'dailyPlus', 'finish'];

async function fillMissingThumbnailsFromDetail(page, items) {
  const targets = items.filter((it) => it && !it.thumbnail && it.link);
  for (const it of targets) {
    try {
      await page.goto(it.link, { waitUntil: 'domcontentloaded' });
      await delay(150);
      const ogImage = await page.evaluate(() => {
        const meta = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
        const content = meta?.getAttribute?.('content');
        return content ? String(content) : null;
      });
      if (ogImage) it.thumbnail = ogImage;
    } catch {
      // ignore
    }
  }
}

async function crawlOneWeekdayTab(page, weekday) {
  const url = `https://comic.naver.com/webtoon?tab=${weekday}`;
  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(400);

  try {
    await page.waitForFunction(() => {
      return document.querySelectorAll('a[href*="titleId="]').length > 0;
    }, { timeout: 5000 });
  } catch {
    // ignore
  }

  const rows = await page.evaluate((wd) => {
    const baseUrl = 'https://comic.naver.com';

    const pickHref = (a) => {
      const href = a?.getAttribute?.('href');
      return href?.startsWith('http') ? href : baseUrl + href;
    };

    const parseTitleId = (absHref) => {
      try {
        const u = new URL(absHref);
        return u.searchParams.get('titleId');
      } catch {
        return null;
      }
    };

    const findRating = (container) => {
      if (!container) return null;

      const bySelector =
        container.querySelector('.rating_type em')?.textContent?.trim() ||
        container.querySelector('[class*="Rating"] em')?.textContent?.trim() ||
        container.querySelector('[class*="rating"] em')?.textContent?.trim() ||
        container.querySelector('[class*="score"], [class*="Score"]')?.textContent?.trim() ||
        null;

      const parse = (t) => {
        if (!t) return null;
        const m = String(t).match(/\b(10(?:\.0+)?|\d(?:\.\d{1,2})?)\b/);
        if (!m) return null;
        const n = Number.parseFloat(m[1]);
        return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
      };

      const direct = parse(bySelector);
      if (direct !== null) return direct;

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node;
      let best = null;
      while ((node = walker.nextNode())) {
        const t = String(node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
        const candidates = t.match(/\b(10(?:\.0+)?|\d\.\d{1,2})\b/g);
        if (candidates) {
          for (const c of candidates) {
            const n = parse(c);
            if (n !== null && (best === null || n > best)) best = n;
          }
        }
      }
      return best;
    };

    const pickThumbnailFromContainer = (container) => {
      if (!container) return null;
      const img = container.querySelector('img');
      if (img) {
        const direct = img.getAttribute('src') || img.getAttribute('data-src');
        if (direct?.startsWith('http')) return direct;

        const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
        if (srcset) {
          const candidates = srcset
            .split(',')
            .map((x) => x.trim().split(' ')[0])
            .filter((url) => url?.startsWith('http'));
          if (candidates.length > 0) return candidates[candidates.length - 1];
        }
      }

      const styleEl = container.querySelector('[style*="url("]');
      const style = styleEl?.getAttribute('style') || '';
      const m = style.match(/url\((['"]?)(.*?)\1\)/);
      return m?.[2]?.startsWith('http') ? m[2] : null;
    };

    const out = [];
    const anchors = Array.from(document.querySelectorAll('a[href*="titleId="]'));
    const seen = new Set();

    for (const a of anchors) {
      const absHref = pickHref(a);
      if (!absHref) continue;
      const titleId = parseTitleId(absHref);
      if (!titleId || seen.has(titleId)) continue;
      seen.add(titleId);

      const container = a.closest('li') || a.closest('div') || a.parentElement;

      const title =
        a?.textContent?.trim() ||
        a?.getAttribute('title')?.trim() ||
        container?.querySelector('[class*="title"], [class*="Title"], strong')?.textContent?.trim() ||
        container?.querySelector('img')?.getAttribute('alt')?.trim() ||
        null;

      const author =
        container?.querySelector('[class*="author"], [class*="Author"], [class*="desc"] a, [class*="creator"]')?.textContent?.trim() ||
        null;

      const thumbnail = pickThumbnailFromContainer(container);
      const rating = findRating(container);

      out.push({
        id: titleId,
        title,
        author,
        thumbnail,
        rating: Number.isFinite(rating) ? rating : null,
        weekday: wd,
        link: absHref,
      });
    }

    return out;
  }, weekday);

  return rows;
}

async function main() {
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const all = [];
    for (const wd of WEEKDAYS) {
      console.log(`Crawling: ${wd}`);
      const rows = await crawlOneWeekdayTab(page, wd);
      console.log(`  found=${rows.length}`);
      all.push(...rows);
      await delay(250);
    }

    const items = uniqBy(all, (x) => `${x.weekday}:${x.id}`);
    const missingThumbs = items.filter((x) => x && !x.thumbnail).length;

    if (missingThumbs > 0) {
      console.log(`Filling missing thumbnails from detail pages: missing=${missingThumbs}`);
      await fillMissingThumbnailsFromDetail(page, items);
    }

    const outDir = path.resolve(process.cwd(), 'data');
    await fs.mkdir(outDir, { recursive: true });

    const outPath = path.join(outDir, `naver-weekday-tabs-${new Date().toISOString().slice(0, 10)}.json`);
    await fs.writeFile(
      outPath,
      JSON.stringify(
        {
          source: 'https://comic.naver.com/webtoon?tab=mon..sun',
          fetchedAt: new Date().toISOString(),
          count: items.length,
          items,
        },
        null,
        2,
      ),
    );

    console.log(`Saved: ${outPath}`);
    console.log(`Count: ${items.length}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});