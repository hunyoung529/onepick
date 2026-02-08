'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuthUser } from '@/hooks/useAuthUser';
import {
  ensureUserProfile,
  setNicknameForUser,
  subscribeUserProfile,
  type UserProfile,
} from '@/lib/user-profile';

type ProfileState = {
  profile: UserProfile | null;
  loading: boolean;
  setNickname: (nickname: string) => Promise<void>;
};

export function useUserProfile(): ProfileState {
  const { user, loading: authLoading } = useAuthUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let unsub: (() => void) | null = null;

    (async () => {
      setLoading(true);
      await ensureUserProfile(user);
      unsub = subscribeUserProfile(user.uid, (p) => {
        setProfile(p);
        setLoading(false);
      });
    })().catch(() => {
      setLoading(false);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [authLoading, user]);

  const setNickname = useMemo(() => {
    return async (nickname: string) => {
      if (!user) throw new Error('로그인이 필요합니다.');
      await setNicknameForUser(user, nickname);
    };
  }, [user]);

  return { profile, loading: authLoading || loading, setNickname };
}
