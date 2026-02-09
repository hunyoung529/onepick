import type { ExternalWorkItem } from '@/lib/external-rankings';

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { nullValue: null }
  | { timestampValue: string };

type FirestoreDoc = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreRunQueryRow = {
  document?: FirestoreDoc;
};

function firestoreApiBase(): { projectId: string; apiKey: string; baseUrl: string } {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '';
  if (!projectId || !apiKey) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_API_KEY');
  }
  return {
    projectId,
    apiKey,
    baseUrl: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`,
  };
}

function fvString(v: FirestoreValue | undefined): string | null {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  return null;
}

function fvNumber(v: FirestoreValue | undefined): number | null {
  if (!v) return null;
  if ('doubleValue' in v) return typeof v.doubleValue === 'number' ? v.doubleValue : null;
  if ('integerValue' in v) {
    const n = Number.parseInt(v.integerValue, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function runQueryAt(parentDocPath: string, structuredQuery: Record<string, unknown>): Promise<FirestoreRunQueryRow[]> {
  const { apiKey, baseUrl } = firestoreApiBase();
  const url = `${baseUrl}/documents/${parentDocPath}:runQuery?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore REST runQuery failed: ${res.status} ${text}`);
  }
  return (await res.json()) as FirestoreRunQueryRow[];
}

async function getDocAt(docPath: string): Promise<FirestoreDoc | null> {
  const { apiKey, baseUrl } = firestoreApiBase();
  const url = `${baseUrl}/documents/${docPath}?key=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore REST get doc failed: ${res.status} ${text}`);
  }
  return (await res.json()) as FirestoreDoc;
}

export async function getLatestNaverSnapshotDateServer(): Promise<string | null> {
  const rows = await runQueryAt('externalRankings/naver', {
    from: [{ collectionId: 'snapshots', allDescendants: false }],
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'DESCENDING' }],
    limit: 1,
  });

  const doc = rows.find((r) => r.document)?.document;
  if (!doc?.name) return null;
  const parts = doc.name.split('/');
  return parts[parts.length - 1] ?? null;
}

export async function getNaverSnapshotItemsByWeekdayServer(
  date: string,
  weekday: string,
  take = 12,
): Promise<ExternalWorkItem[]> {
  const rows = await runQueryAt(`externalRankings/naver/snapshots/${date}`, {
    from: [{ collectionId: 'items', allDescendants: false }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'weekday' },
        op: 'EQUAL',
        value: { stringValue: weekday },
      },
    },
    limit: Math.max(50, take),
  });

  const items: ExternalWorkItem[] = rows
    .map((r) => r.document)
    .filter(Boolean)
    .map((d) => {
      const f = d!.fields ?? {};
      return {
        platform: 'naver' as const,
        id: fvString(f.id) ?? '',
        title: fvString(f.title),
        author: fvString(f.author),
        thumbnail: fvString(f.thumbnail),
        rating: fvNumber(f.rating),
        rank: fvNumber(f.rank),
        weekday: fvString(f.weekday),
        link: fvString(f.link),
      };
    })
    .filter((it) => Boolean(it.id));

  items.sort((a, b) => {
    const ar = typeof a.rank === 'number' ? a.rank : Number.POSITIVE_INFINITY;
    const br = typeof b.rank === 'number' ? b.rank : Number.POSITIVE_INFINITY;
    return ar - br;
  });

  return items.slice(0, take);
}

export async function getNaverSnapshotItemsServer(date: string, take = 100): Promise<ExternalWorkItem[]> {
  const rows = await runQueryAt(`externalRankings/naver/snapshots/${date}`, {
    from: [{ collectionId: 'items', allDescendants: false }],
    limit: take,
  });

  const items: ExternalWorkItem[] = rows
    .map((r) => r.document)
    .filter(Boolean)
    .map((d) => {
      const f = d!.fields ?? {};
      return {
        platform: 'naver' as const,
        id: fvString(f.id) ?? '',
        title: fvString(f.title),
        author: fvString(f.author),
        thumbnail: fvString(f.thumbnail),
        rating: fvNumber(f.rating),
        rank: fvNumber(f.rank),
        weekday: fvString(f.weekday),
        link: fvString(f.link),
      };
    })
    .filter((it) => Boolean(it.id));

  items.sort((a, b) => {
    const ar = typeof a.rank === 'number' ? a.rank : Number.POSITIVE_INFINITY;
    const br = typeof b.rank === 'number' ? b.rank : Number.POSITIVE_INFINITY;
    return ar - br;
  });

  return items.slice(0, take);
}

export async function getAnyNaverWorkByIdServer(id: string): Promise<ExternalWorkItem | null> {
  const doc = await getDocAt(`works/naver_${encodeURIComponent(String(id))}`);
  if (!doc) return null;
  const f = doc.fields ?? {};
  const work: ExternalWorkItem = {
    platform: 'naver' as const,
    id: fvString(f.id) ?? String(id),
    title: fvString(f.title),
    author: fvString(f.author),
    thumbnail: fvString(f.thumbnail),
    rating: fvNumber(f.rating),
    rank: fvNumber(f.rank),
    weekday: fvString(f.weekday),
    link: fvString(f.link),
  };
  return work;
}
