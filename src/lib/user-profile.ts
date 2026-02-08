import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';

import { db } from '@/lib/firebase';

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function readString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export type UserProfile = {
  uid: string;
  email: string | null;
  providerId: string | null;
  nickname: string | null;
};

export function normalizeNickname(input: string): string {
  return input.trim().toLowerCase();
}

export function subscribeUserProfile(uid: string, onChange: (profile: UserProfile | null) => void) {
  const ref = doc(db, 'users', uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }

    const data = asRecord(snap.data() as unknown);
    onChange({
      uid,
      email: readString(data.email),
      providerId: readString(data.providerId),
      nickname: readString(data.nickname),
    });
  });
}

export async function ensureUserProfile(user: User): Promise<void> {
  const uid = user.uid;
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await runTransaction(db as Firestore, async (tx) => {
    const again = await tx.get(ref);
    if (again.exists()) return;

    const providerId = user.providerData?.[0]?.providerId ?? null;

    tx.set(ref, {
      uid,
      email: user.email ?? null,
      providerId,
      nickname: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setNicknameForUser(user: User, rawNickname: string): Promise<void> {
  const nickname = rawNickname.trim();
  if (!nickname) throw new Error('닉네임을 입력해주세요.');

  const normalized = normalizeNickname(nickname);
  const uid = user.uid;

  const userRef = doc(db, 'users', uid);
  const nicknameRef = doc(db, 'nicknames', normalized);

  await runTransaction(db as Firestore, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) {
      const providerId = user.providerData?.[0]?.providerId ?? null;
      tx.set(userRef, {
        uid,
        email: user.email ?? null,
        providerId,
        nickname: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const currentUserSnap = await tx.get(userRef);
    const currentUserData = asRecord(currentUserSnap.data() as unknown);
    const currentNickname = readString(currentUserData.nickname);
    const currentNormalized = currentNickname ? normalizeNickname(currentNickname) : null;

    const claimSnap = await tx.get(nicknameRef);
    if (claimSnap.exists()) {
      const claimData = asRecord(claimSnap.data() as unknown);
      const claimedUid = readString(claimData.uid);
      if (claimedUid && claimedUid !== uid) {
        throw new Error('이미 사용 중인 닉네임입니다.');
      }
    }

    if (currentNormalized && currentNormalized !== normalized) {
      const prevRef = doc(db, 'nicknames', currentNormalized);
      const prevSnap = await tx.get(prevRef);
      const prevUid = prevSnap.exists() ? readString(asRecord(prevSnap.data() as unknown).uid) : null;
      if (prevUid === uid) tx.delete(prevRef);
    }

    tx.set(
      nicknameRef,
      {
        uid,
        nickname,
        normalized,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(
      userRef,
      {
        email: user.email ?? null,
        providerId: user.providerData?.[0]?.providerId ?? null,
        nickname,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}
