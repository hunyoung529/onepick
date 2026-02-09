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

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        total += distance;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function fillMissingMetadataFromDetail(page, items) {
  const isPlaceholderTitle = (t) => {
    const s = String(t ?? '').replace(/\s+/g, '').trim();
    if (!s) return true;
    if (/^\d+$/.test(s)) return true;
    return s === '유료작품' || s === '유료' || s === '성인' || s === '성인작품';
  };

  const isValidThumbnailForId = (thumb, id) => {
    if (!thumb || !id) return false;
    const u = String(thumb);
    if (!u.startsWith('http')) return false;
    if (u.includes(`/webtoon/${id}/`)) return true;
    if (u.includes(`titleId=${id}`)) return true;
    return false;
  };

  const targets = items.filter(
    (it) =>
      it &&
      it.link &&
      (!it.thumbnail ||
        !isValidThumbnailForId(it.thumbnail, it.id) ||
        !it.title ||
        isPlaceholderTitle(it.title) ||
        typeof it.rating !== 'number' ||
        !Array.isArray(it.tags) ||
        it.tags.length === 0),
  );

  const total = targets.length;
  const startedAt = Date.now();
  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  if (total > 0) {
    console.log(`Detail backfill start: total=${total}`);
  }

  for (const it of targets) {
    try {
      await page.goto(it.link, { waitUntil: 'domcontentloaded' });
      await delay(150);
      const detailMeta = await page.evaluate(() => {
        const pick = (selector) => {
          const meta = document.querySelector(selector);
          const content = meta?.getAttribute?.('content');
          return content ? String(content) : null;
        };
        const ogImage =
          pick('meta[property="og:image"]') ||
          pick('meta[name="og:image"]') ||
          pick('meta[name="twitter:image"]');
        const ogTitle =
          pick('meta[property="og:title"]') ||
          pick('meta[name="og:title"]') ||
          document.querySelector('h2, h3, h1')?.textContent?.trim() ||
          null;
        const ratingText =
          pick('meta[property="og:rating"]') ||
          pick('meta[name="og:rating"]') ||
          (document.querySelector('.rating_type em')?.textContent?.trim() ?? null) ||
          (document.querySelector('[class*="Rating"] em')?.textContent?.trim() ?? null) ||
          (document.querySelector('[class*="rating"] em')?.textContent?.trim() ?? null) ||
          null;

        const pickTags = () => {
          const texts = new Set();
          const candidates = [
            ...Array.from(document.querySelectorAll('a[href*="genre"], a[href*="tag"], a[href*="keyword"], [class*="Tag"], [class*="tag"], [class*="genre"], [class*="Genre"]')),
          ];
          for (const el of candidates) {
            const t = String(el?.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (!t) continue;
            const parts = t
              .split(/[#\s,·|/]+/)
              .map((x) => x.trim())
              .filter(Boolean);
            for (const p of parts) {
              if (!p) continue;
              if (p.length > 20) continue;
              if (p.includes('&')) continue;
              if (p.includes('장르') || p.includes('태그')) continue;
              if (!/^[0-9A-Za-z가-힣]+$/.test(p)) continue;
              texts.add(p);
            }
          }
          return Array.from(texts).slice(0, 10);
        };

        return { ogImage, ogTitle, ratingText, tags: pickTags() };
      });

      if ((!it.thumbnail || !isValidThumbnailForId(it.thumbnail, it.id)) && detailMeta.ogImage) {
        const u = String(detailMeta.ogImage);
        if (u.startsWith('http') && (u.includes('/thumbnail/') || u.includes('image-comic.pstatic.net'))) {
          it.thumbnail = u;
        }
      }
      if ((!it.title || isPlaceholderTitle(it.title)) && detailMeta.ogTitle) it.title = detailMeta.ogTitle;
      if (typeof it.rating !== 'number' && detailMeta.ratingText) {
        const m = String(detailMeta.ratingText).match(/\b(10(?:\.0+)?|\d(?:\.\d{1,2})?)\b/);
        const n = m ? Number.parseFloat(m[1]) : null;
        if (Number.isFinite(n) && n >= 0 && n <= 10) it.rating = n;
      }
      if ((!Array.isArray(it.tags) || it.tags.length === 0) && Array.isArray(detailMeta.tags) && detailMeta.tags.length > 0) {
        it.tags = detailMeta.tags;
      }
    } catch {
      // ignore
    }

    const done = targets.indexOf(it) + 1;
    if (done === 1 || done % 10 === 0 || done === total) {
      const elapsed = Date.now() - startedAt;
      const rate = done > 0 ? done / (elapsed / 1000) : 0;
      const remain = total - done;
      const etaMs = rate > 0 ? (remain / rate) * 1000 : 0;
      console.log(
        `Detail backfill: ${done}/${total} elapsed=${fmt(elapsed)} rate=${rate.toFixed(2)}/s eta=${fmt(etaMs)}`,
      );
    }
  }
}

async function crawlOneWeekdayTab(page, weekday) {
  const url = `https://comic.naver.com/webtoon?tab=${weekday}`;
  await page.goto(url, { waitUntil: 'networkidle2' });
  await delay(800); // Increased delay for better loading
  await autoScroll(page);

  try {
    await page.waitForFunction(() => {
      return document.querySelectorAll('a[href*="titleId="]').length > 0;
    }, { timeout: 10000 }); // Increased timeout
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
        container.querySelector('.RatingScore__Score-sc-1t1n3x9-1')?.textContent?.trim() ||
        container.querySelector('[class*="Rating"] em')?.textContent?.trim() ||
        container.querySelector('[class*="rating"] em')?.textContent?.trim() ||
        container.querySelector('[class*="score"], [class*="Score"]')?.textContent?.trim() ||
        container.querySelector('.text_num')?.textContent?.trim() ||
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

    const isValidThumbnailForId = (thumb, id) => {
      if (!thumb || !id) return false;
      const u = String(thumb);
      if (!u.startsWith('http')) return false;
      if (u.includes(`/webtoon/${id}/`)) return true;
      if (u.includes(`titleId=${id}`)) return true;
      return false;
    };

    const pickThumbnailFromContainer = (container, titleId) => {
      if (!container) return null;
      const pickImgUrl = (img) => {
        if (!img) return null;
        const direct =
          img.getAttribute('src') ||
          img.getAttribute('data-src') ||
          img.getAttribute('data-lazy') ||
          img.getAttribute('data-original') ||
          img.getAttribute('data-url');
        if (direct?.startsWith('http')) return direct;

        const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
        if (srcset) {
          const candidates = srcset
            .split(',')
            .map((x) => x.trim().split(' ')[0])
            .filter((url) => url?.startsWith('http'));
          if (candidates.length > 0) return candidates[candidates.length - 1];
        }
        return null;
      };

      const scoreUrl = (url) => {
        if (!url) return -1;
        let s = 0;
        if (url.includes('image-comic.pstatic.net')) s += 3;
        if (url.includes('/webtoon/')) s += 3;
        if (url.includes('/thumbnail/')) s += 3;
        if (titleId && url.includes(`/webtoon/${titleId}/`)) s += 10;
        if (/thumbnail_IMAG21/i.test(url)) s += 2;
        if (/titledescimage/i.test(url)) s += 2;
        return s;
      };

      const imgs = Array.from(container.querySelectorAll('img'));
      const candidates = imgs
        .map((img) => pickImgUrl(img))
        .filter((u) => typeof u === 'string' && u.startsWith('http'));

      if (candidates.length > 0) {
        candidates.sort((a, b) => scoreUrl(b) - scoreUrl(a));
        const best = candidates[0];
        if (scoreUrl(best) > 0) return best;
      }

      const picture = container.querySelector('picture');
      if (picture) {
        const pictureImg = picture.querySelector('img');
        if (pictureImg) {
          const src = pictureImg.getAttribute('src') || pictureImg.getAttribute('data-src');
          if (src?.startsWith('http')) return src;
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

    console.log(`Found ${anchors.length} anchors for ${wd}`);

    let rank = 0;
    for (const a of anchors) {
      const absHref = pickHref(a);
      if (!absHref) continue;
      const titleId = parseTitleId(absHref);
      if (!titleId || seen.has(titleId)) continue;
      seen.add(titleId);

      rank += 1;

      const container = a.closest('li') || a.closest('div') || a.parentElement;

      const rawTitle =
        a?.getAttribute('title')?.trim() ||
        a?.getAttribute('aria-label')?.trim() ||
        a?.dataset?.title?.trim?.() ||
        a?.dataset?.name?.trim?.() ||
        a?.textContent?.trim() ||
        container?.querySelector('[class*="title"], [class*="Title"], strong')?.textContent?.trim() ||
        container?.querySelector('img')?.getAttribute('alt')?.trim() ||
        container?.querySelector('.info .title')?.textContent?.trim() ||
        container?.querySelector('.tit')?.textContent?.trim() ||
        null;

      const isPlaceholderTitle = (t) => {
        const s = String(t ?? '').replace(/\s+/g, '').trim();
        if (!s) return true;
        if (/^\d+$/.test(s)) return true;
        return s === '유료작품' || s === '유료' || s === '성인' || s === '성인작품';
      };

      const title = isPlaceholderTitle(rawTitle) ? null : rawTitle;

      const author =
        container?.querySelector('[class*="author"], [class*="Author"], [class*="desc"] a, [class*="creator"]')?.textContent?.trim() ||
        container?.querySelector('.author')?.textContent?.trim() ||
        container?.querySelector('.name')?.textContent?.trim() ||
        container?.querySelector('.info .author')?.textContent?.trim() ||
        null;

      const picked = pickThumbnailFromContainer(container, titleId);
      const thumbnail = isValidThumbnailForId(picked, titleId) ? picked : null;
      const rating = findRating(container);

      out.push({
        id: titleId,
        title,
        author,
        thumbnail,
        rating: Number.isFinite(rating) ? rating : null,
        rank,
        weekday: wd,
        link: absHref,
        tags: [],
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
    const missingTitles = items.filter((x) => x && !x.title).length;

    if (missingThumbs > 0 || missingTitles > 0) {
      console.log(`Filling missing metadata from detail pages: missingThumbs=${missingThumbs}, missingTitles=${missingTitles}`);
      await fillMissingMetadataFromDetail(page, items);
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