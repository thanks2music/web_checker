'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { mapAuthError } from '@/lib/auth/auth-error';
import { isValidScheduleId } from '@/lib/schedule/schedule-id';
import { ArchiveService } from '@/lib/services/archive.service';
import { ScheduleService } from '@/lib/services/schedule.service';
import { formatJst } from '@/lib/utils/format-date';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ArchiveCard } from '@/components/archives/archive-card';
import type { Archive } from '@/types/archive';
import type { Schedule } from '@/types/schedule';

/**
 * 更新履歴の本体。
 *
 * ## Suspense 境界が必要
 *
 * `useSearchParams` を静的エクスポートで使う場合、Suspense で包まないと
 * `next build` が "Missing Suspense boundary with useSearchParams" で失敗する。
 * 境界は呼び出し側（app/(protected)/detail/page.tsx）に置き、こちらは
 * その内側の Client Component に徹する。
 *
 * ## ページサイズが一覧より小さい
 *
 * `content` はクロールしたページの HTML 断片そのもので、1 件が数十 KB に
 * なりうる。一覧と同じ 20 件だと初回の転送量が跳ねるため小さくしている。
 */

const PAGE_SIZE = 10;

export function ArchivePanel() {
  const searchParams = useSearchParams();
  const scheduleId = searchParams.get('scheduleId');
  const valid = isValidScheduleId(scheduleId);

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [items, setItems] = useState<Archive[]>([]);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(valid);
  const [error, setError] = useState<string | null>(null);

  const initialized = useRef(false);

  const loadPage = useCallback(
    async (id: string, cursorTime?: number) => {
      setLoading(true);
      setError(null);

      try {
        const page = await ArchiveService.listPage(id, { limit: PAGE_SIZE, cursorTime });
        setItems((previous) =>
          cursorTime === undefined ? page.items : [...previous, ...page.items],
        );
        setHasMore(page.hasMore);
        setCursor(page.nextCursorTime ?? undefined);
      } catch (caught) {
        setError(mapAuthError(caught)?.message ?? '更新履歴の取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!valid || initialized.current) return;
    initialized.current = true;

    void loadPage(scheduleId);

    // 見出し用のスケジュール本体。取得できなくても履歴表示は続行したいので
    // 失敗しても error にはせず、見出しを省くだけにする。
    void ScheduleService.get(scheduleId)
      .then(setSchedule)
      .catch(() => setSchedule(null));
  }, [valid, scheduleId, loadPage]);

  if (!valid) {
    return (
      <Alert tone="danger" title="無効なパラメータです">
        <p>スケジュールが指定されていないか、形式が正しくありません。</p>
        <p className="mt-2">
          <Link href="/" className="underline">
            一覧に戻る
          </Link>
        </p>
      </Alert>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">更新履歴</h2>
        <Link href="/" className="text-sm text-primary underline">
          一覧に戻る
        </Link>
      </div>

      {/* どの監視の履歴かを示す。Slack のリンクから直接来ると文脈がないため。 */}
      {schedule ? (
        <div className="mt-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{schedule.title}</p>
          <a
            href={schedule.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline"
          >
            {schedule.uri}
          </a>
          <p className="mt-1">最終チェック: {formatJst(schedule.checkedAt)}</p>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Alert tone="danger" title="読み込みに失敗しました">
            <p>{error}</p>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => void loadPage(scheduleId)}>
                再試行
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {loading && items.length === 0 ? <Spinner label="更新履歴を読み込んでいます" /> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">履歴がありません。</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {items.map((archive) => (
            <ArchiveCard key={archive.id} archive={archive} />
          ))}
        </ul>
      ) : null}

      {hasMore ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void loadPage(scheduleId, cursor)}
          >
            {loading ? '読み込み中…' : 'もっと読む'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
