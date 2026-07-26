'use client';

import { useState } from 'react';

import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

/**
 * Google サインインボタン。
 *
 * FirebaseUI（`firebase-ui-auth__ja.js`）の置き換え。FirebaseUI は実質
 * メンテナンスが止まっており、compat SDK 前提でもあるため modular へ移行するなら
 * どのみち自前で用意する必要がある。
 *
 * 文言は FirebaseUI 日本語版の「Google でログイン」を踏襲する。
 */
export function GoogleSignInButton() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      await signIn();
    } finally {
      // signIn は内部で例外を握って error state に変換するので、
      // ここでは成否によらず操作可能に戻すだけでよい。
      setBusy(false);
    }
  };

  return (
    <Button onClick={() => void handleClick()} disabled={busy} className="w-full sm:w-auto">
      {busy ? 'ログイン中…' : 'Google でログイン'}
    </Button>
  );
}
