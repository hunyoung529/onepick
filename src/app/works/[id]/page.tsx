'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { useAuthUser } from '@/hooks/useAuthUser';
import { getAnyNaverWorkById, type ExternalWorkItem } from '@/lib/external-rankings';

type PageProps = {
  params: { id: string };
};

type CommentItem = {
  id: string;
  uid: string;
  text: string;
  createdAt: unknown;
};

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function workKey(platform: string, id: string) {
  return `${platform}_${id}`;
}

function proxiedImageUrl(url: string): string {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

export default function WorkDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { user, loading } = useAuthUser();

  const [work, setWork] = useState<ExternalWorkItem | null>(null);
  const [workLoading, setWorkLoading] = useState(true);
  const [favLoading, setFavLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [error, setError] = useState('');

  const key = useMemo(() => workKey('naver', params.id), [params.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setWorkLoading(true);
      const w = await getAnyNaverWorkById(params.id);
      if (cancelled) return;
      setWork(w);
      setWorkLoading(false);
    })().catch(() => {
      if (cancelled) return;
      setWork(null);
      setWorkLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setFavLoading(false);
      setIsFav(false);
      return;
    }

    const ref = doc(db, 'favorites', user.uid, 'items', key);
    const unsub = onSnapshot(ref, (snap) => {
      setIsFav(snap.exists());
      setFavLoading(false);
    });

    return () => unsub();
  }, [key, loading, user]);

  useEffect(() => {
    const ref = collection(db, 'comments', key, 'items');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((d) => {
          const data = asRecord(d.data() as unknown);
          return {
            id: d.id,
            uid: readString(data.uid),
            text: readString(data.text),
            createdAt: data.createdAt ?? null,
          };
        }),
      );
    });
    return () => unsub();
  }, [key]);

  const toggleFavorite = async () => {
    setError('');
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const ref = doc(db, 'favorites', user.uid, 'items', key);

    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await deleteDoc(ref);
      } else {
        await setDoc(
          ref,
          {
            platform: 'naver',
            id: params.id,
            title: work?.title ?? null,
            author: work?.author ?? null,
            thumbnail: work?.thumbnail ?? null,
            rating: work?.rating ?? null,
            weekday: work?.weekday ?? null,
            link: work?.link ?? null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message);
      else setError('찜 처리에 실패했습니다.');
    }
  };

  const submitComment = async () => {
    setError('');
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const text = commentText.trim();
    if (!text) return;

    try {
      await addDoc(collection(db, 'comments', key, 'items'), {
        uid: user.uid,
        text,
        createdAt: serverTimestamp(),
      });
      setCommentText('');
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message);
      else setError('댓글 작성에 실패했습니다.');
    }
  };

  if (workLoading) {
    return <div className="py-10 text-sm text-zinc-600">로딩중...</div>;
  }

  if (!work) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-zinc-600">작품 정보를 찾을 수 없습니다.</div>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{work.title ?? params.id}</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          홈
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4">
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-zinc-100">
            {work.thumbnail ? (
              <Image src={proxiedImageUrl(work.thumbnail)} alt={work.title ?? 'thumbnail'} fill className="object-cover" unoptimized />
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="text-sm text-zinc-600">작가: {work.author ?? '-'}</div>
            <div className="text-sm text-zinc-600">평점: {work.rating ?? '-'}</div>
            <div className="text-sm text-zinc-600">요일: {work.weekday ?? '-'}</div>
            <div className="pt-2 flex flex-wrap gap-2">
              <button
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
                onClick={toggleFavorite}
                disabled={favLoading}
              >
                {isFav ? '찜 해제' : '찜하기'}
              </button>
              {work.link ? (
                <a
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                  href={work.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  네이버에서 보기
                </a>
              ) : null}
              <Link
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                href="/me/favorites"
              >
                내 찜 보기
              </Link>
            </div>
            {error ? <p className="pt-2 text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4">
        <div className="text-sm font-medium">댓글</div>
        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="댓글을 입력하세요"
          />
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white" onClick={submitComment}>
            등록
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {comments.length === 0 ? <div className="text-sm text-zinc-500">댓글이 없습니다.</div> : null}
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-zinc-200 p-3">
              <div className="text-xs text-zinc-500">{c.uid}</div>
              <div className="mt-1 text-sm">{c.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
