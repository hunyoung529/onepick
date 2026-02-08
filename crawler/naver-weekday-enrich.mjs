import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function parseNumber(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/,/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

async function readLatestWeekdayJson() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const files = await fs.readdir(dataDir).catch(() => []);
  const candidates = files
    .filter((f) => /^naver-weekday-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const latest = candidates[candidates.length - 1];
  if (!latest) throw new Error('No weekday data found. Run npm run crawl:naver:weekday first.');
  const fullPath = path.join(dataDir, latest);
  const raw = await fs.readFile(fullPath, 'utf8');
  return { fileName: latest, fullPath, json: JSON.parse(raw) };
}

async function extractDetailFromPage(page) {
  // Naver DOM changes frequently. We use multiple fallbacks.
  return await page.evaluate(() => {
    const text = (el) => (el?.textContent ?? '').trim();

    const findFirstNumberNear = (keyword) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const texts = [];
      let node;
      while ((node = walker.nextNode())) {
        const t = String(node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
        if (!t) continue;
        if (t.includes(keyword)) texts.push(t);
      }

      for (const t of texts) {
        // examples: "관심 123,456" "관심등록 12,345" "관심♥ 1234"
        const m = t.match(/([0-9][0-9,]*)/);
        if (m) return m[1];
      }
      return null;
    };

    const title =
      text(document.querySelector('h2, h3, [class*="Title"], [class*="title"]')) ||
      document.title?.replace(/\s*-\s*네이버\s*웹툰.*/i, '').trim() ||
      null;

    const author =
      text(document.querySelector('[class*="Author"], [class*="author"], [class*="name"], a[href*="artist"], a[href*="creator"]')) ||
      null;

    const summary =
      text(document.querySelector('[class*="Summary"], [class*="synopsis"], [class*="description"], [class*="intro"], p')) ||
      null;

    const genreText =
      text(document.querySelector('[class*="Genre"], [class*="genre"], a[href*="genre"], span[class*="tag"], span[class*="Tag"]')) ||
      null;

    // Attempt to find rating-like number (e.g., 9.98)
    const ratingCandidate =
      text(document.querySelector('[class*="Rating"], [class*="rating"], [class*="Score"], [class*="score"]')) ||
      null;

    const interestCandidate =
      text(
        document.querySelector(
          '[class*="Interest"], [class*="interest"], button[aria-label*="관심"], a[aria-label*="관심"], span[aria-label*="관심"]',
        ),
      ) ||
      findFirstNumberNear('관심') ||
      findFirstNumberNear('관심등록') ||
      null;

    return {
      title,
      author,
      summary,
      genre: genreText || null,
      ratingText: ratingCandidate,
      interestText: interestCandidate,
    };
  });
}

async function extractEpisodeCountFromListPage(page) {
  return await page.evaluate(() => {
    const listItems = document.querySelectorAll('li');
    return listItems ? listItems.length : 0;
  });
}

async function crawlOneTitle({ browser, titleId, throttleMs }) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });

    const listUrl = `https://comic.naver.com/webtoon/list?titleId=${encodeURIComponent(titleId)}`;
    await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
    await delay(throttleMs);

    const detail = await extractDetailFromPage(page);

    // episode count from list page's list items is noisy; try to narrow down
    // We'll count rows inside known list container if possible
    const episodeCount = await page.evaluate(() => {
      const candidates = [
        document.querySelectorAll('[class*="EpisodeList"] li'),
        document.querySelectorAll('[class*="episode"] li'),
        document.querySelectorAll('ul li'),
      ];
      for (const nodeList of candidates) {
        if (nodeList && nodeList.length > 0) return nodeList.length;
      }
      return 0;
    });

    const rating = detail.ratingText ? Number(String(detail.ratingText).match(/\d+(\.\d+)?/)?.[0] ?? '') : null;

    const interestCount = detail.interestText
      ? Number(String(detail.interestText).replace(/[^0-9]/g, ''))
      : null;

    return {
      id: String(titleId),
      platform: 'naver',
      link: listUrl,
      title: detail.title ?? null,
      thumbnail: null,
      author: detail.author ?? null,
      genre: detail.genre ?? null,
      summary: detail.summary ?? null,
      rating: Number.isFinite(rating) ? rating : null,
      episodeCount: typeof episodeCount === 'number' ? episodeCount : null,
      interestCount: Number.isFinite(interestCount) ? interestCount : null,
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const limit = Number(getArg('limit', '50'));
  const throttleMs = Number(getArg('throttle', '300'));

  const { fileName, fullPath, json } = await readLatestWeekdayJson();
  const items = json.items ?? [];

  const uniqueTitleIds = Array.from(
    new Set(items.map((x) => x?.id).filter(Boolean)),
  );

  const target = uniqueTitleIds.slice(0, limit);

  console.log(`Input: ${fileName}`);
  console.log(`Unique titleIds: ${uniqueTitleIds.length}`);
  console.log(`Enrich target: ${target.length} (limit=${limit})`);

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const enriched = [];
    for (let i = 0; i < target.length; i++) {
      const titleId = target[i];
      try {
        const row = await crawlOneTitle({ browser, titleId, throttleMs });
        enriched.push(row);
        console.log(`[${i + 1}/${target.length}] ok titleId=${titleId}`);
      } catch (e) {
        console.log(`[${i + 1}/${target.length}] fail titleId=${titleId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const outDir = path.resolve(process.cwd(), 'data');
    await fs.mkdir(outDir, { recursive: true });

    const outPath = path.join(
      outDir,
      `naver-weekday-enriched-${new Date().toISOString().slice(0, 10)}.json`,
    );

    await fs.writeFile(
      outPath,
      JSON.stringify(
        {
          sourceWeekdayFile: path.basename(fullPath),
          fetchedAt: new Date().toISOString(),
          limit,
          throttleMs,
          count: enriched.length,
          items: enriched,
        },
        null,
        2,
      ),
    );

    console.log(`Saved: ${outPath}`);
    console.log(`Count: ${enriched.length}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
