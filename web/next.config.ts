import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Firebase Hosting へ静的配信する。管理画面はログイン必須のクライアントサイド CRUD で
  // SSR を必要とせず、静的エクスポートなら Hosting の構成が現行 (public/*.html) と同じで済む。
  //
  // トレードオフとして middleware と API Route が使えなくなる。つまり Revolution の
  // apps/ai-writer が持つ「AuthContext → /api/auth/set-token で Admin SDK 検証 →
  // httpOnly Cookie → middleware」という多層防御は構造的に流用できない。
  // 本アプリの実質的なセキュリティ境界は Firestore Rules ただ一つであり、
  // 画面側の認証ガードは UX のための飾りである、という前提で設計している。
  // @see ../firestore.rules
  output: 'export',

  // 既定値と同じだが「意図的に false」であることを明示する。
  //
  // true にすると export 結果が out/detail/index.html になり、Slack 通知に
  // 埋め込まれている過去リンク /detail.html?scheduleId=... が 404 になる。
  // false なら out/detail.html が生成され、Firebase Hosting の exact-match で
  // クエリごとそのまま配信されるため、旧 URL が設定ゼロで生き続ける。
  // @see functions/src/webCrawler.ts の slackFormat（差分一覧リンクの組み立て）
  trailingSlash: false,

  // output: 'export' では next/image の既定ローダーが使えない。
  // 現時点で next/image は未使用だが、将来追加した際にビルドを通すために明示しておく。
  images: { unoptimized: true },

  reactStrictMode: true,

  // Phase 2 で Revolution monorepo へ移す際、shared/schemas を参照するなら以下を追加する:
  // transpilePackages: ['@revolution/schemas'],
};

export default nextConfig;
