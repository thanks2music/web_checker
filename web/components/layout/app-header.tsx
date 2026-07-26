'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';

/**
 * 共通ヘッダー。
 *
 * 現行のナビは Bootstrap の `navbar-expand-lg` + `.collapse.navbar-collapse` を
 * 使いながらトグルボタンも Bootstrap JS も読み込んでおらず、**幅 992px 未満で
 * ログアウトリンクが表示されない**（＝モバイルからログアウトできない）不具合があった。
 * ここでは折りたたみ自体をやめ、どの幅でも常に操作できるようにしている。
 *
 * ログアウトはリンク遷移ではなくボタンにして、3 秒待たずに即座に完了させる。
 * 旧 /logout.html も残してあるので、ブックマーク経由の従来動線も生きている。
 */
export function AppHeader() {
  const { email, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          WEB CHECKER
        </Link>

        <div className="flex items-center gap-3">
          {email ? (
            <span className="text-sm text-muted-foreground">{email}</span>
          ) : null}
          <Button variant="ghost" onClick={() => void handleSignOut()}>
            ログアウト
          </Button>
        </div>
      </div>
    </header>
  );
}
