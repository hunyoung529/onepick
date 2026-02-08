'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

import { db } from '@/lib/firebase';
import { useAuthUser } from '@/hooks/useAuthUser';

type FavoriteItem = {
  id: string;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  rating: number | null;
  platform: string | null;
};

export default function FavoritesPage() {
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const [items, setItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    const ref = collection(db, 'favorites', user.uid, 'items');
    const q = query(ref, orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: String(data.id ?? d.id),
            title: data.title ?? null,
            author: data.author ?? null,
            thumbnail: data.thumbnail ?? null,
            rating: typeof data.rating === 'number' ? data.rating : null,
            platform: data.platform ?? null,
          };
        }),
      );
    });

    return () => unsub();
  }, [loading, router, user]);

  if (loading) return <div className="py-10 text-sm text-zinc-600">로딩중...</div>;
  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">내 찜 목록</h1>
        <Link href="/me" className="text-sm text-blue-600 hover:underline">
          내정보
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-zinc-600">아직 찜한 작품이 없습니다.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <Link key={`${it.platform ?? 'naver'}_${it.id}`} href={`/works/${it.id}`} className="rounded-2xl border border-zinc-200 p-4 hover:bg-zinc-50">
              <div className="flex gap-3">
                <div className="relative h-24 w-20 overflow-hidden rounded-xl bg-zinc-100">
                  {it.thumbnail ? <Image src={it.thumbnail} alt={it.title ?? 'thumbnail'} fill className="object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{it.title ?? it.id}</div>
                  <div className="mt-1 text-xs text-zinc-600">{it.author ?? '-'}</div>
                  <div className="mt-2 text-xs text-zinc-500">평점: {it.rating ?? '-'}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
