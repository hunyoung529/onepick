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
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getAnyNaverWorkById, type ExternalWorkItem } from '@/lib/external-rankings';

type CommentItem = {
  id: string;
  uid: string;
  nickname: string;
  text: string;
  createdAt: unknown;
  updatedAt: unknown;
  upCount: number;
  downCount: number;
  myVote: 1 | -1 | 0;
};

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function readNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function formatMaybeTimestamp(v: unknown): string {
  const r = asRecord(v);
  const seconds = typeof r.seconds === 'number' ? r.seconds : null;
  if (seconds !== null) {
    const d = new Date(seconds * 1000);
    return d.toLocaleString('ko-KR');
  }

  if (v instanceof Date) return v.toLocaleString('ko-KR');
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('ko-KR');
  }
  return '';
}

function workKey(platform: string, id: string) {
  return `${platform}_${id}`;
}

function proxiedImageUrl(url: string): string {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

export default function WorkDetailClient({ id, initialWork }: { id: string; initialWork: ExternalWorkItem | null }) {
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const { profile } = useUserProfile();

  const [work, setWork] = useState<ExternalWorkItem | null>(initialWork);
  const [workLoading, setWorkLoading] = useState(initialWork === null);
  const [favLoading, setFavLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentSort, setCommentSort] = useState<'latest' | 'recommended'>('latest');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [commentMessage, setCommentMessage] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const key = useMemo(() => workKey('naver', id), [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initialWork) return;
      setWorkLoading(true);
      const w = await getAnyNaverWorkById(id);
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
  }, [id, initialWork]);

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
    let unsubVotes: (() => void) | null = null;
    const unsub = onSnapshot(q, (snap) => {
      const base = snap.docs.map((d) => {
        const data = asRecord(d.data() as unknown);
        return {
          id: d.id,
          uid: readString(data.uid),
          nickname: readString(data.nickname) || readString(data.uid),
          text: readString(data.text),
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
          upCount: readNumber(data.upCount),
          downCount: readNumber(data.downCount),
          myVote: 0 as 1 | -1 | 0,
        } satisfies CommentItem;
      });

      setComments(base);

      if (unsubVotes) {
        unsubVotes();
        unsubVotes = null;
      }

      if (!user) return;

      // per-user votes (client-side merge)
      const voteUnsubs = base.map((c) => {
        const vref = doc(db, 'comments', key, 'items', c.id, 'votes', user.uid);
        return onSnapshot(vref, (vsnap) => {
          const vdata = vsnap.exists() ? asRecord(vsnap.data() as unknown) : {};
          const val = typeof vdata.value === 'number' ? vdata.value : 0;
          setComments((prev) =>
            prev.map((p) => (p.id === c.id ? { ...p, myVote: (val === 1 ? 1 : val === -1 ? -1 : 0) as 1 | -1 | 0 } : p)),
          );
        });
      });
      unsubVotes = () => voteUnsubs.forEach((fn) => fn());
    });
    return () => {
      if (unsubVotes) unsubVotes();
      unsub();
    };
  }, [key, user]);

  const visibleComments = useMemo(() => {
    if (commentSort === 'latest') return comments;
    const next = [...comments];
    next.sort((a, b) => {
      const as = (a.upCount - a.downCount) || 0;
      const bs = (b.upCount - b.downCount) || 0;
      if (bs !== as) return bs - as;
      return 0;
    });
    return next;
  }, [commentSort, comments]);

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
            id,
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
        nickname: profile?.nickname ?? user.email ?? null,
        text,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        upCount: 0,
        downCount: 0,
      });
      setCommentText('');
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message);
      else setError('댓글 작성에 실패했습니다.');
    }
  };

  const voteComment = async (commentId: string, nextVote: 1 | -1) => {
    setError('');
    setCommentMessage((prev) => ({ ...prev, [commentId]: '' }));
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const mine = comments.find((c) => c.id === commentId)?.uid === user.uid;
    if (mine) {
      setCommentMessage((prev) => ({ ...prev, [commentId]: '내가 작성한 댓글에는 추천/비추천할 수 없습니다.' }));
      return;
    }

    const commentRef = doc(db, 'comments', key, 'items', commentId);
    const voteRef = doc(db, 'comments', key, 'items', commentId, 'votes', user.uid);

    try {
      await runTransaction(db, async (tx) => {
        const voteSnap = await tx.get(voteRef);
        const prev = voteSnap.exists() ? asRecord(voteSnap.data() as unknown) : {};
        const prevVal = typeof prev.value === 'number' ? prev.value : 0;
        const newVal = prevVal === nextVote ? 0 : nextVote;

        const commentSnap = await tx.get(commentRef);
        const cdata = commentSnap.exists() ? asRecord(commentSnap.data() as unknown) : {};
        let up = readNumber(cdata.upCount);
        let down = readNumber(cdata.downCount);

        if (prevVal === 1) up = Math.max(0, up - 1);
        if (prevVal === -1) down = Math.max(0, down - 1);
        if (newVal === 1) up += 1;
        if (newVal === -1) down += 1;

        tx.set(voteRef, { uid: user.uid, value: newVal, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(commentRef, { upCount: up, downCount: down, updatedAt: serverTimestamp() }, { merge: true });
      });
    } catch (e: unknown) {
      if (e instanceof Error) {
        setCommentMessage((prev) => ({ ...prev, [commentId]: e.message }));
      } else {
        setCommentMessage((prev) => ({ ...prev, [commentId]: '추천 처리에 실패했습니다.' }));
      }
    }
  };

  const startEdit = (c: CommentItem) => {
    setEditingId(c.id);
    setEditingText(c.text);
    setConfirmDeleteId(null);
    setCommentMessage((prev) => ({ ...prev, [c.id]: '' }));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const saveEdit = async () => {
    setError('');
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!editingId) return;

    const text = editingText.trim();
    if (!text) return;

    const ref = doc(db, 'comments', key, 'items', editingId);
    try {
      const snap = await getDoc(ref);
      const data = snap.exists() ? asRecord(snap.data() as unknown) : {};
      if (!snap.exists() || readString(data.uid) !== user.uid) {
        setCommentMessage((prev) => ({ ...prev, [editingId]: '수정 권한이 없습니다.' }));
        return;
      }
      await setDoc(ref, { text, updatedAt: serverTimestamp() }, { merge: true });
      cancelEdit();
    } catch (e: unknown) {
      if (e instanceof Error) {
        setCommentMessage((prev) => ({ ...prev, [editingId]: e.message }));
      } else {
        setCommentMessage((prev) => ({ ...prev, [editingId]: '댓글 수정에 실패했습니다.' }));
      }
    }
  };

  const removeComment = async (commentId: string) => {
    setError('');
    setCommentMessage((prev) => ({ ...prev, [commentId]: '' }));
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const ref = doc(db, 'comments', key, 'items', commentId);
    try {
      const snap = await getDoc(ref);
      const data = snap.exists() ? asRecord(snap.data() as unknown) : {};
      if (!snap.exists() || readString(data.uid) !== user.uid) {
        setCommentMessage((prev) => ({ ...prev, [commentId]: '삭제 권한이 없습니다.' }));
        return;
      }
      await deleteDoc(ref);
      setConfirmDeleteId(null);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setCommentMessage((prev) => ({ ...prev, [commentId]: e.message }));
      } else {
        setCommentMessage((prev) => ({ ...prev, [commentId]: '댓글 삭제에 실패했습니다.' }));
      }
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
        <h1 className="text-xl font-semibold">{work.title ?? id}</h1>
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
              <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50" href="/me/favorites">
                내 찜 보기
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4">
        <div className="text-sm font-medium">댓글</div>
        <div className="mt-2 flex gap-2">
          <button
            className={
              'rounded-full border px-3 py-1 text-sm ' +
              (commentSort === 'latest' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
            }
            onClick={() => setCommentSort('latest')}
          >
            최신순
          </button>
          <button
            className={
              'rounded-full border px-3 py-1 text-sm ' +
              (commentSort === 'recommended' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
            }
            onClick={() => setCommentSort('recommended')}
          >
            추천순
          </button>
        </div>
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
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 space-y-2">
          {comments.length === 0 ? <div className="text-sm text-zinc-500">댓글이 없습니다.</div> : null}
          {visibleComments.map((c) => {
            const isMine = !!user && c.uid === user.uid;
            const created = formatMaybeTimestamp(c.createdAt);
            const updated = formatMaybeTimestamp(c.updatedAt);
            const score = (c.upCount ?? 0) - (c.downCount ?? 0);
            const msg = commentMessage[c.id] ?? '';

            return (
              <div key={c.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-600 truncate">{c.nickname || c.uid}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {created ? `작성: ${created}` : ''}
                      {updated && updated !== created ? ` · 수정: ${updated}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className={
                        'rounded-lg border px-2 py-1 text-xs ' +
                        (c.myVote === 1 ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
                      }
                      onClick={() => (isMine ? setCommentMessage((prev) => ({ ...prev, [c.id]: '내가 작성한 댓글에는 추천/비추천할 수 없습니다.' })) : voteComment(c.id, 1))}
                    >
                      추천 {c.upCount ?? 0}
                    </button>
                    <button
                      className={
                        'rounded-lg border px-2 py-1 text-xs ' +
                        (c.myVote === -1 ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:bg-zinc-50')
                      }
                      onClick={() => (isMine ? setCommentMessage((prev) => ({ ...prev, [c.id]: '내가 작성한 댓글에는 추천/비추천할 수 없습니다.' })) : voteComment(c.id, -1))}
                    >
                      비추천 {c.downCount ?? 0}
                    </button>
                    <div className="text-xs text-zinc-500">점수 {score}</div>
                  </div>
                </div>

                {msg ? <div className="mt-2 text-xs text-red-600">{msg}</div> : null}

                {editingId === c.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white" onClick={saveEdit}>
                        저장
                      </button>
                      <button className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" onClick={cancelEdit}>
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm whitespace-pre-wrap">{c.text}</div>
                )}

                {isMine && editingId !== c.id ? (
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-lg border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50" onClick={() => startEdit(c)}>
                      수정
                    </button>
                    {confirmDeleteId === c.id ? (
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-zinc-600">진짜 삭제하시겠습니까?</div>
                        <button
                          className="rounded-lg border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50"
                          onClick={() => removeComment(c.id)}
                        >
                          삭제
                        </button>
                        <button
                          className="rounded-lg border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        className="rounded-lg border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50"
                        onClick={() => {
                          setConfirmDeleteId(c.id);
                          setCommentMessage((prev) => ({ ...prev, [c.id]: '' }));
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
