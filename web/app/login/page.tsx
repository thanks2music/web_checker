'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth/auth-context';
import { AuthErrorAlert } from '@/components/auth/auth-error-alert';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { PendingApproval } from '@/components/auth/pending-approval';
import { Spinner } from '@/components/ui/spinner';

/**
 * ログイン画面。static export で out/login.html になり、
 * 現行 public/login.html と同じ URL を保つ。
 *
 * 承認待ちは専用 URL（/pending 等）を作らずこのページの状態として扱う。
 * 「承認待ち」はページではなく状態であり、直リンクされても意味がないため。
 */
export default function LoginPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authorized') {
      router.replace('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <Spinner label="認証情報を確認しています" />;
  }

  if (status === 'pending-approval') {
    return <PendingApproval />;
  }

  if (status === 'authorized') {
    return <Spinner label="スケジュール一覧へ移動しています" />;
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">WEB CHECKER</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Web ページの変更を監視して Slack に通知します
      </p>

      <hr className="my-6 border-border" />

      <h2 className="text-lg font-semibold">ログイン</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        初回ログイン時は管理者の承認が必要です。
      </p>

      <div className="mt-4">
        <GoogleSignInButton />
      </div>

      <AuthErrorAlert />
    </main>
  );
}
