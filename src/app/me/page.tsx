'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthUser } from '@/hooks/useAuthUser';
import { useUserProfile } from '@/hooks/useUserProfile';

function getProviderLabel(providerId: string | null | undefined) {
  if (!providerId) return '알 수 없음';
  if (providerId === 'password') return '이메일';
  if (providerId === 'google.com') return '구글';
  return providerId;
}

export default function MePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading, setNickname } = useUserProfile();

  const providerId = useMemo(() => user?.providerData?.[0]?.providerId ?? null, [user]);

  const [nickname, setNicknameInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace('/login');
  }, [authLoading, router, user]);

  useEffect(() => {
    if (profile?.nickname) setNicknameInput(profile.nickname);
  }, [profile?.nickname]);

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      await setNickname(nickname);
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message);
      else setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || profileLoading) {
    return <div className="py-10 text-sm text-zinc-600">로딩중...</div>;
  }

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">내정보</h1>
        <p className="mt-1 text-sm text-zinc-600">로그인 정보와 닉네임을 관리합니다.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4">
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-zinc-500">로그인 방식</div>
            <div className="font-medium">{getProviderLabel(providerId)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-zinc-500">이메일</div>
            <div className="font-medium">{user.email ?? '-'}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-zinc-500">닉네임</div>
            <div className="font-medium">{profile?.nickname ?? '-'}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4">
        <div className="text-sm font-medium">닉네임 변경</div>
        <div className="mt-2 flex gap-2">
          <input
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            value={nickname}
            onChange={(e) => setNicknameInput(e.target.value)}
            placeholder="닉네임"
          />
          <button
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={save}
            disabled={saving}
          >
            저장
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <p className="mt-2 text-xs text-zinc-500">닉네임은 중복될 수 없습니다.</p>
      </div>
    </div>
  );
}
