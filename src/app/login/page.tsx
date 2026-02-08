'use client';

import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';

import { auth } from '@/lib/firebase';
import { useAuthUser } from '@/hooks/useAuthUser';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuthUser();

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (user) router.replace('/my');
  }, [loading, router, user]);

  const submit = async () => {
    setError('');
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, pw);
      } else {
        await createUserWithEmailAndPassword(auth, email, pw);
      }

      router.push('/my');
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError('로그인에 실패했습니다.');
    }
  };

  const submitGoogle = async () => {
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push('/my');
    } catch (err: unknown) {
      const maybeCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: unknown }).code
          : undefined;
      if (maybeCode === 'auth/popup-blocked') {
        const provider = new GoogleAuthProvider();
        await signInWithRedirect(auth, provider);
        return;
      }

      if (err instanceof Error) setError(err.message);
      else setError('구글 로그인에 실패했습니다.');
    }
  };

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="mb-4 text-2xl font-bold">{mode === 'login' ? '로그인' : '회원가입'}</h1>
      <input
        className="mb-2 w-full border px-3 py-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일"
      />
      <input
        className="mb-2 w-full border px-3 py-2"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="비밀번호"
        type="password"
      />
      {error && <p className="mb-2 text-red-500">{error}</p>}
      <button className="mb-2 w-full border border-zinc-200 px-4 py-2" onClick={submitGoogle}>
        Google로 로그인
      </button>
      <button className="w-full bg-blue-500 px-4 py-2 text-white" onClick={submit}>
        {mode === 'login' ? '로그인' : '회원가입'}
      </button>
      <button
        className="mt-2 text-sm underline"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
      >
        {mode === 'login' ? '회원가입 하기' : '로그인으로 돌아가기'}
      </button>
    </div>
  );
}
