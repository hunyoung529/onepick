import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

export type ExternalWorkItem = {
  platform: 'naver';
  id: string;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  rating: number | null;
  weekday: string | null;
  link: string | null;
};

export async function getLatestNaverSnapshotDate(): Promise<string | null> {
  const snapshotsRef = collection(db, 'externalRankings', 'naver', 'snapshots');
  const q = query(snapshotsRef, orderBy('__name__', 'desc'), limit(1));
  const snap = await getDocs(q);
  const first = snap.docs[0];
  return first ? first.id : null;
}

export async function getNaverSnapshotItems(date: string, take = 30): Promise<ExternalWorkItem[]> {
  const itemsRef = collection(db, 'externalRankings', 'naver', 'snapshots', date, 'items');
  const q = query(itemsRef, orderBy('__name__', 'asc'), limit(take));
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      platform: 'naver',
      id: String(data.id),
      title: data.title ?? null,
      author: data.author ?? null,
      thumbnail: data.thumbnail ?? null,
      rating: typeof data.rating === 'number' ? data.rating : null,
      weekday: data.weekday ?? null,
      link: data.link ?? null,
    };
  });
}

export async function getAnyNaverWorkById(id: string): Promise<ExternalWorkItem | null> {
  const ref = doc(db, 'works', `naver_${String(id)}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return {
    platform: 'naver',
    id: String(data.id),
    title: data.title ?? null,
    author: data.author ?? null,
    thumbnail: data.thumbnail ?? null,
    rating: typeof data.rating === 'number' ? data.rating : null,
    weekday: data.weekday ?? null,
    link: data.link ?? null,
  };
}

export async function getNaverSnapshotMeta(date: string): Promise<{ date: string; count: number | null } | null> {
  const ref = doc(db, 'externalRankings', 'naver', 'snapshots', date);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return {
    date,
    count: typeof data.count === 'number' ? data.count : null,
  };
}
