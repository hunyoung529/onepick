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

type WeekdayKey = (typeof WEEKDAYS)[number]['key'];

function normalizeWeekday(v: string | undefined): WeekdayKey {
  const s = String(v ?? '').trim().toLowerCase();
  return (WEEKDAYS.find((w) => w.key === (s as WeekdayKey))?.key ?? 'all') as WeekdayKey;
}

function normalizeSort(v: string | undefined): 'rank' | 'rating' {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'rating' ? 'rating' : 'rank';
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
  searchParams?: { weekday?: string; sort?: string };
}) {
  const weekday = normalizeWeekday(searchParams?.weekday);
  const sort = normalizeSort(searchParams?.sort);

  let date: string | null = null;
  let items: ExternalWorkItem[] = [];
  let error = '';

  try {
    date = await getLatestNaverSnapshotDateServer();
    if (date) {
      items =
        weekday === 'all'
          ? await getNaverSnapshotItemsServer(date, 100)
          : await getNaverSnapshotItemsByWeekdayServer(date, weekday, 100);
    }
    items = sortItems(items, sort).slice(0, 50);
  } catch (e: unknown) {
    if (e instanceof Error) error = e.message;
    else error = '데이터를 불러오지 못했습니다. (unknown error)';
    items = [];
  }

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
              const href = `/ranking?weekday=${encodeURIComponent(w.key)}&sort=${encodeURIComponent(sort)}`;
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
          <div className="text-sm font-medium">정렬</div>
          <div className="flex gap-2">
            {(
              [
                { key: 'rank' as const, label: '순위' },
                { key: 'rating' as const, label: '평점' },
              ] as const
            ).map((s) => {
              const active = sort === s.key;
              const href = `/ranking?weekday=${encodeURIComponent(weekday)}&sort=${encodeURIComponent(s.key)}`;
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
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((it, idx) => (
            <Link
              key={`${it.platform}_${it.id}_${it.weekday ?? ''}_${idx}`}
              href={`/works/${it.id}`}
              className="rounded-2xl border border-zinc-200 p-4 hover:bg-zinc-50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold truncate">{it.title ?? it.id}</div>
                <div className="text-xs text-zinc-500 shrink-0">
                  {sort === 'rating' ? `⭐ ${it.rating ?? '-'}` : `#${it.rank ?? idx + 1}`}
                </div>
              </div>
              <div className="mt-2 flex gap-3">
                <div className="relative h-24 w-20 overflow-hidden rounded-xl bg-zinc-100 shrink-0">
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
                  <div className="text-xs text-zinc-600 truncate">{it.author ?? '-'}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    요일: {it.weekday ?? '-'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">평점: {it.rating ?? '-'}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
