"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ExternalWorkItem } from '@/lib/external-rankings';
import { getLatestNaverSnapshotDate, getNaverSnapshotItems } from '@/lib/external-rankings';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <Link href="/ranking" className="text-sm text-zinc-600 hover:text-zinc-900">
          더보기
        </Link>
      </div>
      {children}
    </section>
  );
}

export default function HomePage() {
  const [date, setDate] = useState<string | null>(null);
  const [items, setItems] = useState<ExternalWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const latest = await getLatestNaverSnapshotDate();
      if (cancelled) return;
      setDate(latest);
      const nextItems = latest ? await getNaverSnapshotItems(latest, 12) : [];
      if (cancelled) return;
      setItems(nextItems);
      setLoading(false);
    })().catch((e: unknown) => {
      if (cancelled) return;
      setItems([]);
      if (e instanceof Error) setError(e.message);
      else setError('데이터를 불러오지 못했습니다. (unknown error)');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">오늘의 랭킹</h1>
        <p className="mt-1 text-sm text-zinc-600">오늘의 인기작 / 급상승 / 장르별 추천을 한 번에.</p>
      </div>

      <Section title="오늘의 인기작">
        <div className="grid gap-3 sm:grid-cols-3">
          {loading ? (
            <div className="text-sm text-zinc-600">불러오는 중...</div>
          ) : error ? (
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
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-zinc-100">
                  {it.thumbnail ? <Image src={it.thumbnail} alt={it.title ?? 'thumbnail'} fill className="object-cover" /> : null}
                </div>
                <div className="mt-3 text-sm font-semibold">{it.title ?? it.id}</div>
                <div className="mt-1 text-xs text-zinc-600">{it.author ?? '-'}</div>
                <div className="mt-1 text-xs text-zinc-500">평점: {it.rating ?? '-'}</div>
              </Link>
            ))
          )}
        </div>
      </Section>

      <Section title="급상승">
        <div className="grid gap-3 sm:grid-cols-2">
          {['rise-1', 'rise-2'].map((id) => (
            <Link key={id} href={`/works/${id}`} className="rounded-2xl border border-zinc-200 p-4 hover:bg-zinc-50">
              <div className="flex gap-3">
                <div className="h-24 w-20 rounded-xl bg-zinc-100" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">급상승 작품 {id}</div>
                  <div className="mt-1 text-xs text-zinc-600">지표 변화 · 플랫폼</div>
                  <div className="mt-3 text-xs text-zinc-500">(임시) 전일 대비 순위 상승</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="장르별 추천">
        <div className="flex flex-wrap gap-2">
          {['로맨스', '판타지', '액션', '스릴러', '드라마'].map((g) => (
            <Link key={g} href={`/ranking?genre=${encodeURIComponent(g)}`} className="rounded-full border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50">
              {g}
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
