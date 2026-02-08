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

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function readString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function readNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

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
    const data = asRecord(d.data() as unknown);
    return {
      platform: 'naver',
      id: String((data.id ?? '') as unknown),
      title: readString(data.title),
      author: readString(data.author),
      thumbnail: readString(data.thumbnail),
      rating: readNumber(data.rating),
      weekday: readString(data.weekday),
      link: readString(data.link),
    };
  });
}

export async function getAnyNaverWorkById(id: string): Promise<ExternalWorkItem | null> {
  const ref = doc(db, 'works', `naver_${String(id)}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = asRecord(snap.data() as unknown);
  return {
    platform: 'naver',
    id: String((data.id ?? id) as unknown),
    title: readString(data.title),
    author: readString(data.author),
    thumbnail: readString(data.thumbnail),
    rating: readNumber(data.rating),
    weekday: readString(data.weekday),
    link: readString(data.link),
  };
}

export async function getNaverSnapshotMeta(date: string): Promise<{ date: string; count: number | null } | null> {
  const ref = doc(db, 'externalRankings', 'naver', 'snapshots', date);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = asRecord(snap.data() as unknown);
  return {
    date,
    count: readNumber(data.count),
  };
}
