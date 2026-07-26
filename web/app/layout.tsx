import type { Metadata } from 'next';

import { AuthProvider } from '@/lib/auth/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'WEB CHECKER',
  description: 'Web ページの変更を監視して Slack に通知します',
};

/**
 * AuthProvider は body 直下に置く（Revolution の apps/ai-writer と同じ形）。
 * login / logout は保護対象外なので、ガードはここではなく
 * app/(protected)/layout.tsx に置いている。
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
