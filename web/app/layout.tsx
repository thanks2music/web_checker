import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WEB CHECKER',
  description: 'Web ページの変更を監視して Slack に通知します',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
