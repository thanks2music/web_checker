'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth/auth-context';
import { PendingApproval } from '@/components/auth/pending-approval';
import { Spinner } from '@/components/ui/spinner';

/**
 * 保護されたページのゲート。
 *
 * **これは UX のための飾りであり、セキュリティ境界ではない。**
 * 静的エクスポートなので DevTools からバイパスできる。実際の防壁は
 * firestore.rules で、承認されていないユーザーはここを抜けてもデータを読めない。
 * @see lib/auth/auth-context.tsx の冒頭コメント
 *
 * 未認証時に `router.replace` を使うのは、現行 routing.js の
 * `location.href` が履歴を汚し、ブラウザバックで login と index を
 * 往復してしまう問題があったため。
 *
 * 現行実装ではページ内の onAuthStateChanged と routing.js の 2 箇所が
 * それぞれリダイレクトを撃っていて競合していたが、ここでは status という
 * 単一のソースだけを見るので競合しない。
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <Spinner label="認証情報を確認しています" />;
  }

  if (status === 'unauthenticated') {
    // リダイレクトが走るまでの一瞬。ここで children を描くと
    // 未認証のまま Firestore を叩いて permission-denied が出る。
    return <Spinner label="ログイン画面へ移動しています" />;
  }

  if (status === 'pending-approval') {
    return <PendingApproval />;
  }

  return <>{children}</>;
}
