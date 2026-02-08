'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthUser } from '@/hooks/useAuthUser';
import { useUserProfile } from '@/hooks/useUserProfile';

export default function MyPage() {
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile();

  useEffect(() => {
    if (loading || profileLoading) return;
    if (!user) router.replace('/login');
    else if (!profile?.nickname) router.replace('/me');
  }, [loading, profile?.nickname, profileLoading, router, user]);

  if (loading || profileLoading) {
    return <div className="py-10 text-sm text-zinc-600">로딩중...</div>;
  }

  if (!user) {
    return null;
  }

  if (!profile?.nickname) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">내 찜목록</h1>
        <p className="mt-1 text-sm text-zinc-600">내가 찜한 작품 정렬 / 삭제 / 다시보기 / 추천받기</p>
        {user.email ? <p className="mt-2 text-sm text-zinc-500">로그인: {user.email}</p> : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4">
        <div className="text-sm font-medium">TODO</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
          <li>ProfileView</li>
          <li>찜 목록 리스트(WorkCard)</li>
          <li>정렬/삭제/추천받기 액션</li>
        </ul>
      </div>
    </div>
  );
}
