import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function crawlNaverWeekdayTopWebtoons() {
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto('https://comic.naver.com/webtoon/weekday', {
      waitUntil: 'networkidle2',
    });

    await delay(500);

    const data = await page.evaluate(() => {
      const baseUrl = 'https://comic.naver.com';

      const uniq = new Map();

      const anchors = Array.from(document.querySelectorAll('a[href*="/webtoon/list"], a[href*="titleId="]'));
      for (const a of anchors) {
        const href = a.getAttribute('href');
        if (!href) continue;

        const abs = href.startsWith('http') ? href : baseUrl + href;

        let titleId = null;
        try {
          const u = new URL(abs);
          titleId = u.searchParams.get('titleId') || null;
        } catch {
          // ignore
        }
        if (!titleId) continue;

        const title =
          a.querySelector('[class*="title"], [class*="text"], strong, span')?.textContent?.trim() ||
          a.getAttribute('title')?.trim() ||
          a.querySelector('img')?.getAttribute('alt')?.trim() ||
          null;

        const img =
          a.querySelector('img')?.getAttribute('src') ||
          a.querySelector('img')?.getAttribute('data-src') ||
          null;

        const author =
          a.querySelector('[class*="author"], [class*="name"], em')?.textContent?.trim() || null;

        if (!uniq.has(titleId)) {
          uniq.set(titleId, {
            id: titleId,
            platform: 'naver',
            title,
            thumbnail: img,
            author,
            link: abs,
          });
        }
      }

      return Array.from(uniq.values());
    });

    return data;
  } finally {
    await browser.close();
  }
}

async function main() {
  const data = await crawlNaverWeekdayTopWebtoons();

  const outDir = path.resolve(process.cwd(), 'data');
  await fs.mkdir(outDir, { recursive: true });

  const outPath = path.join(outDir, `naver-weekday-${new Date().toISOString().slice(0, 10)}.json`);
  await fs.writeFile(outPath, JSON.stringify({
    source: 'https://comic.naver.com/webtoon/weekday',
    fetchedAt: new Date().toISOString(),
    count: data.length,
    items: data,
  }, null, 2));

  console.log(`Saved: ${outPath}`);
  console.log(`Count: ${data.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
