'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';

type WorkLite = {
  platform: 'naver' | 'kakao';
  id: string;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  rating: number | null;
  rank?: number | null;
  weekday: string | null;
  tags?: string[] | null;
};

function proxiedImageUrl(url: string): string {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

function isValidTag(v: unknown): v is string {
  const s = String(v ?? '').trim();
  if (!s) return false;
  if (s.length > 20) return false;
  if (s.includes('&')) return false;
  if (s.includes('장르') || s.includes('태그')) return false;
  if (!/^[0-9A-Za-z가-힣]+$/.test(s)) return false;
  return true;
}

export default function HomeGenreSection({
  topGenres,
  items,
}: {
  topGenres: string[];
  items: WorkLite[];
}) {
  const [active, setActive] = useState<string>(topGenres[0] ?? '');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    if (!active) return [];
    const out = items.filter((it) => Array.isArray(it.tags) && it.tags.some((t) => isValidTag(t) && t.trim() === active));
    out.sort((a, b) => {
      const ar = typeof a.rank === 'number' ? a.rank : Number.POSITIVE_INFINITY;
      const br = typeof b.rank === 'number' ? b.rank : Number.POSITIVE_INFINITY;
      return ar - br;
    });
    return out.slice(0, 20);
  }, [active, items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">장르별 추천</h2>
        <Link
          href={`/ranking?weekday=all&sort=rank${active ? `&genre=${encodeURIComponent(active)}` : ''}`}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          더보기
        </Link>
      </div>

      {topGenres.length === 0 ? (
        <div className="text-sm text-zinc-600">장르 태그 데이터가 아직 없습니다.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {topGenres.map((g) => {
            const isActive = g === active;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setActive(g)}
                className={
                  'rounded-full border px-3 py-2 text-sm ' +
                  (isActive ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
                }
              >
                #{g}
              </button>
            );
          })}
        </div>
      )}

      {active && filtered.length === 0 ? (
        <div className="text-sm text-zinc-600">표시할 작품이 없습니다.</div>
      ) : null}

      {filtered.length > 0 ? (
        <div
          ref={scrollerRef}
          className="-mx-4 overflow-x-auto px-4 overscroll-x-contain"
          style={{ touchAction: 'pan-x' }}
          onWheel={(e) => {
            const el = scrollerRef.current;
            if (!el) return;
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            el.scrollLeft += e.deltaY;
            e.preventDefault();
          }}
        >
          <div className="flex gap-3 snap-x snap-mandatory">
            {filtered.map((it) => (
              <Link
                key={`${it.platform}_${it.id}_${it.weekday ?? ''}_${active}`}
                href={`/works/${it.id}`}
                className="snap-start min-w-[220px] max-w-[220px] rounded-2xl border border-zinc-200 p-4 hover:bg-zinc-50"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">#{it.rank ?? '-'}</div>
                  <div className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700">
                    {it.platform === 'naver' ? 'NAVER' : it.platform.toUpperCase()}
                  </div>
                </div>
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-zinc-100">
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
                <div className="mt-3 text-sm font-semibold line-clamp-2">{it.title ?? it.id}</div>
                <div className="mt-1 text-xs text-zinc-600 truncate">{it.author ?? '-'}</div>
                <div className="mt-1 text-xs text-zinc-500">평점: {it.rating ?? '-'}</div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
