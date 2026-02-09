'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { signOut } from 'firebase/auth';

import { useAuthUser } from '@/hooks/useAuthUser';
import { useUserProfile } from '@/hooks/useUserProfile';
import { auth } from '@/lib/firebase';

type AppShellProps = {
  title?: string;
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/ranking', label: '전체 순위' },
  { href: '/recommend', label: 'AI 추천' },
  { href: '/my', label: '내 찜' },
];

const MOBILE_NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/ranking', label: '순위' },
  { href: '/recommend', label: '추천' },
  { href: '/my', label: '찜' },
  { href: '/me', label: '내정보' },
];

export default function AppShell({ title = 'Onepick', children }: AppShellProps) {
  const pathname = usePathname();
  const { user, loading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile();

  const displayName = profile?.nickname || user?.email || '';

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-base font-semibold tracking-tight">
            {title}
          </Link>
          <div className="flex items-center gap-3">
            {!loading && !profileLoading && user && displayName ? (
              <div className="hidden text-sm text-zinc-600 sm:block">{displayName}</div>
            ) : null}
          <nav className="hidden gap-4 text-sm text-zinc-600 sm:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? 'font-semibold text-zinc-900' : 'hover:text-zinc-900'}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
            {!loading && user ? (
              <>
                <Link
                  href="/me"
                  className="hidden rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 sm:inline-flex"
                >
                  내정보
                </Link>
                <button
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                  onClick={() => signOut(auth)}
                >
                  로그아웃
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
              >
                로그인
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-20">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white sm:hidden">
        <div className="mx-auto grid max-w-5xl grid-cols-5 px-2">
          {MOBILE_NAV_ITEMS.map((item) => {
            const href = item.href === '/me' && !loading && !user ? '/login' : item.href;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={href}
                className={
                  'flex h-14 flex-col items-center justify-center text-xs ' +
                  (active ? 'text-zinc-900 font-semibold' : 'text-zinc-500')
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
