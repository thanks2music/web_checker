'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * 認証エラーの表示。
 *
 * `mapAuthError` が null を返す種類（ポップアップを自分で閉じた等）は
 * そもそも state に入らないので、ここに来た時点で必ず表示対象になる。
 *
 * `pending` は承認待ち画面側で扱うため、ここでは出さない。
 */
export function AuthErrorAlert() {
  const { error, clearError } = useAuth();

  if (!error || error.kind === 'pending') return null;

  return (
    <div className="mt-4">
      <Alert tone={error.kind === 'config' ? 'warning' : 'danger'} title={error.title}>
        <p>{error.message}</p>
        {error.code ? (
          <p className="mt-1 text-xs opacity-70">エラーコード: {error.code}</p>
        ) : null}
        {error.retryable ? (
          <div className="mt-3">
            <Button variant="secondary" onClick={clearError}>
              閉じて再試行
            </Button>
          </div>
        ) : null}
      </Alert>
    </div>
  );
}
