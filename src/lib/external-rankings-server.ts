import type { ExternalWorkItem } from '@/lib/external-rankings';

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { arrayValue: { values?: FirestoreValue[] } }
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

function readStringField(fields: Record<string, FirestoreValue> | null | undefined, name: string): string | null {
  return fvString(fields?.[name]);
}

function readNumberField(fields: Record<string, FirestoreValue> | null | undefined, name: string): number | null {
  return fvNumber(fields?.[name]);
}

function readStringArrayField(fields: Record<string, FirestoreValue> | null | undefined, name: string): string[] | null {
  const v = fields?.[name];
  if (!v || !('arrayValue' in v)) return null;
  const values = v.arrayValue?.values ?? [];
  const out = values
    .map((x) => fvString(x) ?? '')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return out.length > 0 ? out : null;
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
  take = 30,
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
      const fields = (d!.fields ?? {}) as Record<string, FirestoreValue>;
      return {
        platform: 'naver' as const,
        id: readStringField(fields, 'id') ?? '',
        title: readStringField(fields, 'title'),
        author: readStringField(fields, 'author'),
        thumbnail: readStringField(fields, 'thumbnail'),
        rating: readNumberField(fields, 'rating'),
        rank: readNumberField(fields, 'rank'),
        weekday: readStringField(fields, 'weekday'),
        link: readStringField(fields, 'link'),
        tags: readStringArrayField(fields, 'tags'),
      } satisfies ExternalWorkItem;
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
      const fields = (d!.fields ?? {}) as Record<string, FirestoreValue>;
      return {
        platform: 'naver' as const,
        id: readStringField(fields, 'id') ?? '',
        title: readStringField(fields, 'title'),
        author: readStringField(fields, 'author'),
        thumbnail: readStringField(fields, 'thumbnail'),
        rating: readNumberField(fields, 'rating'),
        rank: readNumberField(fields, 'rank'),
        weekday: readStringField(fields, 'weekday'),
        link: readStringField(fields, 'link'),
        tags: readStringArrayField(fields, 'tags'),
      } satisfies ExternalWorkItem;
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
  const fields = (doc.fields ?? {}) as Record<string, FirestoreValue>;
  return {
    platform: 'naver' as const,
    id: readStringField(fields, 'id') ?? String(id),
    title: readStringField(fields, 'title'),
    author: readStringField(fields, 'author'),
    thumbnail: readStringField(fields, 'thumbnail'),
    rating: readNumberField(fields, 'rating'),
    rank: readNumberField(fields, 'rank'),
    weekday: readStringField(fields, 'weekday'),
    link: readStringField(fields, 'link'),
    tags: readStringArrayField(fields, 'tags'),
  } satisfies ExternalWorkItem;
}
