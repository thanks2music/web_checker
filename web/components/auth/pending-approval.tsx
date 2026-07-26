'use client';

import { useState } from 'react';

import { useAuth } from '@/lib/auth/auth-context';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * 承認待ち画面。
 *
 * ## 2 つの経路がここに着地する
 *
 * 1. 新規ユーザー: beforeCreate が `{ disabled: true }` を返すのでサインイン自体が
 *    `auth/user-disabled` で失敗する。これが**主要導線**
 * 2. 管理者が `disabled: false` にしたが approved claim を付け忘れた／未反映:
 *    サインインは成功するが Firestore が permission-denied を返す
 *
 * どちらもユーザーは何も間違っていないので、赤いエラーではなく待機案内として見せる。
 *
 * ## 「承認状態を再確認」ボタンが必須である理由
 *
 * ID トークンは最大 1 時間キャッシュされ、管理者が claim を付けても即座には
 * 反映されない。手動リフレッシュの導線が無いと「承認したのに入れない」という
 * 問い合わせが必ず発生する。自動ポーリングにしないのは securetoken の
 * レートリミットを避けるため。
 *
 * ## メールアドレスを必ず出す
 *
 * 管理者に承認を依頼する際、どのアカウントかを伝えられないと実務が回らない。
 * user が取れない（user-disabled）場合は、サインイン失敗時の例外から拾った値を使う。
 */
export function PendingApproval() {
  const { email, refreshClaims, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [stillPending, setStillPending] = useState(false);

  const handleRecheck = async () => {
    setChecking(true);
    setStillPending(false);
    try {
      const approved = await refreshClaims();
      // 承認済みなら status が変わって画面ごと切り替わるので、ここは未承認時のみ効く。
      if (!approved) setStillPending(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">WEB CHECKER</h1>

      <div className="mt-6">
        <Alert tone="info" title="アカウントの承認をお待ちください">
          <p>管理者に登録の通知が送信されました。承認され次第ご利用いただけます。</p>
          {email ? (
            <p className="mt-2">
              申請中のアカウント: <span className="font-medium">{email}</span>
            </p>
          ) : null}
        </Alert>
      </div>

      {stillPending ? (
        <div className="mt-4">
          <Alert tone="warning">
            まだ承認されていません。管理者の対応をお待ちください。
          </Alert>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => void handleRecheck()} disabled={checking}>
          {checking ? '確認中…' : '承認状態を再確認'}
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          別のアカウントでログイン
        </Button>
      </div>
    </main>
  );
}
