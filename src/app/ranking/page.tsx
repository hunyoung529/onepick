import Link from 'next/link';

import Image from 'next/image';

import {
  getLatestNaverSnapshotDateServer,
  getNaverSnapshotItemsByWeekdayServer,
  getNaverSnapshotItemsServer,
} from '@/lib/external-rankings-server';
import type { ExternalWorkItem } from '@/lib/external-rankings';

function proxiedImageUrl(url: string): string {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

const WEEKDAYS = [
  { key: 'all', label: '전체' },
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
] as const;

const PLATFORMS = [
  { key: 'all', label: '전체' },
  { key: 'naver', label: 'NAVER' },
  { key: 'kakao', label: 'KAKAO' },
] as const;

type WeekdayKey = (typeof WEEKDAYS)[number]['key'];
type PlatformKey = (typeof PLATFORMS)[number]['key'];

function isValidTag(v: unknown): v is string {
  const s = String(v ?? '').trim();
  if (!s) return false;
  if (s.length > 20) return false;
  if (s.includes('&')) return false;
  if (s.includes('장르') || s.includes('태그')) return false;
  if (!/^[0-9A-Za-z가-힣]+$/.test(s)) return false;
  return true;
}

function normalizeWeekday(v: string | undefined): WeekdayKey {
  const s = String(v ?? '').trim().toLowerCase();
  return (WEEKDAYS.find((w) => w.key === (s as WeekdayKey))?.key ?? 'all') as WeekdayKey;
}

function normalizeSort(v: string | undefined): 'rank' | 'rating' {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'rating' ? 'rating' : 'rank';
}

function normalizeGenre(v: string | undefined): string | null {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
}

function normalizePlatform(v: string | undefined): PlatformKey {
  const s = String(v ?? '').trim().toLowerCase();
  return (PLATFORMS.find((p) => p.key === (s as PlatformKey))?.key ?? 'all') as PlatformKey;
}

function sortItems(items: ExternalWorkItem[], sort: 'rank' | 'rating'): ExternalWorkItem[] {
  const next = [...items];
  if (sort === 'rating') {
    next.sort((a, b) => {
      const ar = typeof a.rating === 'number' ? a.rating : Number.NEGATIVE_INFINITY;
      const br = typeof b.rating === 'number' ? b.rating : Number.NEGATIVE_INFINITY;
      return br - ar;
    });
    return next;
  }

  next.sort((a, b) => {
    const ar = typeof a.rank === 'number' ? a.rank : Number.POSITIVE_INFINITY;
    const br = typeof b.rank === 'number' ? b.rank : Number.POSITIVE_INFINITY;
    return ar - br;
  });
  return next;
}

export const revalidate = 300;

export default async function RankingPage({
  searchParams,
}: {
  searchParams?: { weekday?: string; sort?: string; genre?: string; platform?: string };
}) {
  const weekday = normalizeWeekday(searchParams?.weekday);
  const sort = normalizeSort(searchParams?.sort);
  const genre = normalizeGenre(searchParams?.genre);
  const platform = normalizePlatform(searchParams?.platform);

  let date: string | null = null;
  let items: ExternalWorkItem[] = [];
  let genreSourceItems: ExternalWorkItem[] = [];
  let error = '';

  try {
    date = await getLatestNaverSnapshotDateServer();
    if (date) {
      items =
        weekday === 'all'
          ? await getNaverSnapshotItemsServer(date, 100)
          : await getNaverSnapshotItemsByWeekdayServer(date, weekday, 100);
    }
    const filtered1 = platform === 'all' ? items : items.filter((it) => it.platform === platform);
    genreSourceItems = filtered1;

    const filtered2 = genre
      ? filtered1.filter((it) => Array.isArray(it.tags) && it.tags.some((t) => isValidTag(t) && t.trim() === genre))
      : filtered1;
    items = sortItems(filtered2, sort).slice(0, 50);
  } catch (e: unknown) {
    if (e instanceof Error) error = e.message;
    else error = '데이터를 불러오지 못했습니다. (unknown error)';
    items = [];
    genreSourceItems = [];
  }

  const baseQuery = {
    weekday,
    sort,
    platform,
    genre,
  };

  const makeHref = (next: Partial<typeof baseQuery>) => {
    const q = { ...baseQuery, ...next };
    const p = new URLSearchParams();
    p.set('weekday', q.weekday);
    p.set('sort', q.sort);
    if (q.platform !== 'all') p.set('platform', q.platform);
    if (q.genre) p.set('genre', q.genre);
    return `/ranking?${p.toString()}`;
  };

  const genreChips = (() => {
    const counts = new Map<string, number>();
    for (const it of genreSourceItems) {
      const tags = Array.isArray(it.tags) ? it.tags : [];
      for (const t of tags) {
        if (!isValidTag(t)) continue;
        const key = t.trim();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const out = sorted.slice(0, 12);
    if (genre && !out.includes(genre)) out.unshift(genre);
    return out.slice(0, 12);
  })();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">전체 순위</h1>
        <p className="mt-1 text-sm text-zinc-600">네이버 랭킹 스냅샷 기반으로 표시합니다.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">요일</div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((w) => {
              const active = weekday === w.key;
              const href = makeHref({ weekday: w.key });
              return (
                <Link
                  key={w.key}
                  href={href}
                  className={
                    'rounded-full border px-3 py-1 text-sm ' +
                    (active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
                  }
                >
                  {w.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">장르</div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={makeHref({ genre: null })}
              className={
                'rounded-full border px-3 py-1 text-sm ' +
                (!genre ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
              }
            >
              전체
            </Link>
            {genreChips.map((g) => {
              const active = genre === g;
              return (
                <Link
                  key={g}
                  href={makeHref({ genre: g })}
                  className={
                    'rounded-full border px-3 py-1 text-sm ' +
                    (active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
                  }
                >
                  #{g}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">플랫폼</div>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const active = platform === p.key;
              const href = makeHref({ platform: p.key as PlatformKey });
              return (
                <Link
                  key={p.key}
                  href={href}
                  className={
                    'rounded-full border px-3 py-1 text-sm ' +
                    (active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
                  }
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">정렬</div>
          <div className="flex gap-2">
            {(
              [
                { key: 'rank' as const, label: '순위' },
                { key: 'rating' as const, label: '평점' },
              ] as const
            ).map((s) => {
              const active = sort === s.key;
              const href = makeHref({ sort: s.key });
              return (
                <Link
                  key={s.key}
                  href={href}
                  className={
                    'rounded-full border px-3 py-1 text-sm ' +
                    (active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
                  }
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="text-xs text-zinc-500">{date ? `latest: ${date}` : 'latest: -'}</div>
      </div>

      {error ? <div className="text-sm text-red-600">Firestore 로딩 에러: {error}</div> : null}

      {items.length === 0 && !error ? (
        <div className="text-sm text-zinc-600">랭킹 데이터가 없습니다.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, idx) => (
            <Link
              key={`${it.platform}_${it.id}_${it.weekday ?? ''}_${idx}`}
              href={`/works/${it.id}`}
              className="rounded-2xl border border-zinc-200 p-6 hover:bg-zinc-50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold leading-snug line-clamp-2">{it.title ?? it.id}</div>
                <div className="text-sm text-zinc-500 shrink-0">
                  {sort === 'rating' ? `⭐ ${it.rating ?? '-'}` : `#${it.rank ?? idx + 1}`}
                </div>
              </div>
              <div className="mt-4 flex gap-5">
                <div className="relative h-44 w-32 overflow-hidden rounded-2xl bg-zinc-100 shrink-0">
                  {it.thumbnail ? (
                    <Image
                      src={proxiedImageUrl(it.thumbnail)}
                      alt={it.title ?? 'thumbnail'}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-700 truncate">{it.author ?? '-'}</div>
                  <div className="mt-2 text-sm text-zinc-600">
                    요일: {it.weekday ?? '-'}
                  </div>
                  <div className="mt-2 text-sm text-zinc-600">평점: {it.rating ?? '-'}</div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700">
                        {it.platform === 'naver' ? 'NAVER' : it.platform.toUpperCase()}
                      </span>
                    </div>
                    {Array.isArray(it.tags) && it.tags.some((t) => isValidTag(t)) ? (
                      <div className="flex flex-wrap gap-1">
                        {it.tags
                          .filter((t) => isValidTag(t))
                          .slice(0, 3)
                          .map((t) => (
                            <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
                              #{t}
                            </span>
                          ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
