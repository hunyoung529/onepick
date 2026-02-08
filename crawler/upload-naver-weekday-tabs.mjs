import fs from 'node:fs/promises';
import path from 'node:path';

import admin from 'firebase-admin';

function getArg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function findLatestTabsJson() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const files = await fs.readdir(dataDir).catch(() => []);
  const candidates = files
    .filter((f) => /^naver-weekday-tabs-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  const latest = candidates[candidates.length - 1];
  if (!latest) {
    throw new Error('No tabs data found. Run npm run crawl:naver:weekday:tabs first.');
  }

  return path.join(dataDir, latest);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

async function initAdmin() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    throw new Error('Missing env FIREBASE_SERVICE_ACCOUNT_PATH (path to service account JSON).');
  }

  const json = await readJson(serviceAccountPath);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(json),
    });
  }

  return admin.firestore();
}

async function main() {
  const date = getArg('date', getToday());
  const input = getArg('input', null) ?? (await findLatestTabsJson());

  const data = await readJson(input);
  const items = Array.isArray(data.items) ? data.items : [];

  const db = await initAdmin();

  // Structure:
  // externalRankings/naver/snapshots/{date}
  // externalRankings/naver/snapshots/{date}/items/{weekday}_{id}
  const snapshotRef = db
    .collection('externalRankings')
    .doc('naver')
    .collection('snapshots')
    .doc(date);

  await snapshotRef.set(
    {
      platform: 'naver',
      source: data.source ?? 'https://comic.naver.com/webtoon?tab=mon..sun',
      date,
      fetchedAt: data.fetchedAt ?? new Date().toISOString(),
      count: items.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const bulk = db.bulkWriter();

  let written = 0;
  let worksUpserted = 0;
  for (const it of items) {
    if (!it?.id || !it?.weekday) continue;
    const docId = `${it.weekday}_${it.id}`;

    const itemRef = snapshotRef.collection('items').doc(docId);
    bulk.set(
      itemRef,
      {
        id: String(it.id),
        title: it.title ?? null,
        author: it.author ?? null,
        thumbnail: it.thumbnail ?? null,
        rating: typeof it.rating === 'number' ? it.rating : null,
        weekday: it.weekday,
        link: it.link ?? null,
        platform: 'naver',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const workRef = db.collection('works').doc(`naver_${it.id}`);
    bulk.set(
      workRef,
      {
        platform: 'naver',
        id: String(it.id),
        title: it.title ?? null,
        author: it.author ?? null,
        thumbnail: it.thumbnail ?? null,
        rating: typeof it.rating === 'number' ? it.rating : null,
        link: it.link ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    worksUpserted++;

    written++;
  }

  await bulk.close();

  console.log(`Input: ${input}`);
  console.log(`Uploaded snapshot: externalRankings/naver/snapshots/${date}`);
  console.log(`Written items: ${written}`);
  console.log(`Upserted works: ${worksUpserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
