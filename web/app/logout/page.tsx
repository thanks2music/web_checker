'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth/auth-context';

/**
 * ログアウト画面。static export で out/logout.html になる。
 *
 * 現行 public/logout.html は「ページに到達した時点で無条件に signOut し、
 * 3 秒後に login へ遷移する」挙動で、ナビの「ログアウト」は単なるリンクだった。
 * ブックマークや直リンクでこの URL を叩く運用があり得るので、同じ挙動を保つ。
 *
 * ヘッダーからのログアウトは PR E 以降でボタン化し、3 秒待たずに遷移させる予定。
 */
const REDIRECT_DELAY_MS = 3000;

export default function LogoutPage() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  // React 18 以降の StrictMode は effect を 2 回走らせるため、
  // signOut が二重に呼ばれないようにする。
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let timer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        await signOut();
        setState('done');
        timer = setTimeout(() => router.replace('/login'), REDIRECT_DELAY_MS);
      } catch {
        // 失敗時は自動遷移せず、手動リンクだけ残す（現行踏襲）。
        setState('failed');
      }
    })();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [signOut, router]);

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">ログアウト</h1>

      <p className="mt-4 text-sm" role="status">
        {state === 'working' ? 'ログアウト処理中...' : null}
        {state === 'done' ? 'ログアウトしました。' : null}
        {state === 'failed' ? 'ログアウトに失敗しました。' : null}
      </p>

      {state !== 'working' ? (
        <Link
          href="/login"
          className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          ログインページへ
        </Link>
      ) : null}
    </main>
  );
}
