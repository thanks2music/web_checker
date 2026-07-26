import { AuthGuard } from '@/components/auth/auth-guard';
import { AppHeader } from '@/components/layout/app-header';

/**
 * ログインが必要な画面のレイアウト。
 *
 * `(protected)` は Route Group なので URL には現れない。つまり
 * `app/(protected)/page.tsx` は `/`（out/index.html）のまま、
 * `app/(protected)/detail/page.tsx` は `/detail`（out/detail.html）になる。
 * 認証の構造をディレクトリで表現しつつ、URL 互換を壊さないための配置。
 */
export default function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGuard>
      <AppHeader />
      {children}
    </AuthGuard>
  );
}
