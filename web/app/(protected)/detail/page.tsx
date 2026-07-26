import { Suspense } from 'react';

import { ArchivePanel } from '@/components/archives/archive-panel';
import { Spinner } from '@/components/ui/spinner';

/**
 * 更新履歴ページ。
 *
 * ## URL 互換の要
 *
 * `trailingSlash: false` の静的エクスポートにより、このルートは
 * **out/detail.html** という単一ファイルとして出力される。Firebase Hosting は
 * これを exact-match でクエリごとそのまま返すので、Slack 通知に埋め込まれた
 * `/detail.html?scheduleId=...` が rewrite なしで生き続ける。
 * @see functions/src/webCrawler.ts（通知リンクの組み立て）
 * @see next.config.ts（trailingSlash を false で固定している理由）
 *
 * ## このファイルに 'use client' を付けない
 *
 * 付けると Suspense の外側まで CSR になり、境界を設けた意味が失われる。
 * `useSearchParams` を使うのは内側の ArchivePanel だけに留める。
 */
export default function DetailPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Suspense fallback={<Spinner label="更新履歴を読み込んでいます" />}>
        <ArchivePanel />
      </Suspense>
    </main>
  );
}
