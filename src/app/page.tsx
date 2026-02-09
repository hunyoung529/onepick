import Image from 'next/image';
import Link from 'next/link';

import HomeGenreSection from './HomeGenreSection';

import type { ExternalWorkItem } from '@/lib/external-rankings';
import {
  getLatestNaverSnapshotDateServer,
  getNaverSnapshotItemsByWeekdayServer,
  getNaverSnapshotItemsServer,
} from '@/lib/external-rankings-server';

function getKstWeekdayKey(d = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  return map[day] ?? 'mon';
}

function proxiedImageUrl(url: string): string {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

function Section({
  title,
  moreHref,
  children,
}: {
  title: string;
  moreHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {moreHref ? (
          <Link href={moreHref} className="text-sm text-zinc-600 hover:text-zinc-900">
            더보기
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export const revalidate = 300;

export default async function HomePage() {
  let date: string | null = null;
  let items: ExternalWorkItem[] = [];
  let allItems: ExternalWorkItem[] = [];
  let error = '';
  const wd = getKstWeekdayKey();

  try {
    date = await getLatestNaverSnapshotDateServer();
    items = date ? await getNaverSnapshotItemsByWeekdayServer(date, wd, 12) : [];
    allItems = date ? await getNaverSnapshotItemsServer(date, 200) : [];
  } catch (e: unknown) {
    if (e instanceof Error) error = e.message;
    else error = '데이터를 불러오지 못했습니다. (unknown error)';
    items = [];
    allItems = [];
  }

  const topGenres = (() => {
    const counts = new Map<string, number>();
    for (const it of allItems) {
      const tags = Array.isArray(it.tags) ? it.tags : [];
      for (const t of tags) {
        const key = String(t ?? '').trim();
        if (!key) continue;
        if (key.length > 20) continue;
        if (key.includes('&')) continue;
        if (key.includes('장르') || key.includes('태그')) continue;
        if (!/^[0-9A-Za-z가-힣]+$/.test(key)) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const sorted = Array.from(counts.entries());
    sorted.sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 10).map(([k]) => k);
  })();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">오늘의 랭킹</h1>
        <p className="mt-1 text-sm text-zinc-600">오늘의 인기작 / 급상승 / 장르별 추천을 한 번에.</p>
      </div>

      <Section title="요일별 웹툰" moreHref="/ranking?weekday=all&sort=rank">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'mon', label: '월' },
              { key: 'tue', label: '화' },
              { key: 'wed', label: '수' },
              { key: 'thu', label: '목' },
              { key: 'fri', label: '금' },
              { key: 'sat', label: '토' },
              { key: 'sun', label: '일' },
            ] as const
          ).map((w) => (
            <Link
              key={w.key}
              href={`/ranking?weekday=${encodeURIComponent(w.key)}&sort=rank`}
              className="rounded-full border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
            >
              {w.label}
            </Link>
          ))}
        </div>
      </Section>

      <Section title="오늘의 인기작" moreHref={`/ranking?weekday=${encodeURIComponent(wd)}&sort=rank`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {error ? (
            <div className="text-sm text-red-600">
              Firestore 로딩 에러: {error}
              {date ? ` (latest: ${date})` : ''}
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-600">
              외부 랭킹 데이터가 아직 없습니다. 업로드 후 새로고침 해주세요.
              {date ? ` (latest: ${date})` : ''}
            </div>
          ) : (
            items.slice(0, 6).map((it) => (
              <Link
                key={`${it.platform}_${it.id}_${it.weekday ?? ''}`}
                href={`/works/${it.id}`}
                className="rounded-2xl border border-zinc-200 p-4 hover:bg-zinc-50"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">#{it.rank ?? '-'}</div>
                  <div className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700">
                    {it.platform === 'naver' ? 'NAVER' : it.platform.toUpperCase()}
                  </div>
                </div>
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-zinc-100">
                  {it.thumbnail ? (
                    <Image src={proxiedImageUrl(it.thumbnail)} alt={it.title ?? 'thumbnail'} fill className="object-cover" unoptimized />
                  ) : null}
                </div>
                <div className="mt-3 text-sm font-semibold">{it.title ?? it.id}</div>
                <div className="mt-1 text-xs text-zinc-600">{it.author ?? '-'}</div>
                <div className="mt-1 text-xs text-zinc-500">평점: {it.rating ?? '-'}</div>
              </Link>
            ))
          )}
        </div>
      </Section>

      <HomeGenreSection topGenres={topGenres} items={allItems} />
    </div>
  );
}
