'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { mapAuthError } from '@/lib/auth/auth-error';
import { ScheduleService } from '@/lib/services/schedule.service';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ScheduleRow } from '@/components/schedules/schedule-row';
import type { Schedule } from '@/types/schedule';

/**
 * スケジュール一覧。
 *
 * ## ページネーション方式
 *
 * 「次へ / 前へ」ではなく「もっと読む」の追記型。Firestore の startAfter は
 * 前方向が素直で、戻るには endBefore + limitToLast とカーソル履歴の管理が要る。
 * 監視ダッシュボードは新しい順に上から眺める用途なので、追記型で足りる。
 *
 * 現行実装は limit なしの全件取得だった。
 *
 * ## エラー時に「何も無い」と嘘をつかない
 *
 * 読み込みに失敗したとき、現行 UI は `alert()` を出したうえで一覧を空のまま
 * 残していた。空の一覧は「登録が 0 件」に見えるので、取得失敗と区別できない。
 * ここでは失敗を明示し、再試行導線を出す。
 */

const PAGE_SIZE = 20;

export function ScheduleList() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** StrictMode の二重実行で初回ロードが 2 回走らないようにする。 */
  const initialized = useRef(false);

  const load = useCallback(async (cursorCreatedAt?: number) => {
    setLoading(true);
    setError(null);

    try {
      const page = await ScheduleService.listPage({
        limit: PAGE_SIZE,
        cursorCreatedAt,
      });

      // 追記型なので、初回（カーソル無し）だけ置き換えて以降は連結する。
      setItems((previous) =>
        cursorCreatedAt === undefined ? page.items : [...previous, ...page.items],
      );
      setHasMore(page.hasMore);
      setCursor(page.nextCursorCreatedAt ?? undefined);
    } catch (caught) {
      // permission-denied は approved claim 未反映の可能性が高い。
      // AuthProvider 側の分類をそのまま使い、文言を二重管理しない。
      const view = mapAuthError(caught);
      setError(view?.message ?? 'スケジュールの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void load();
  }, [load]);

  if (loading && items.length === 0) {
    return <Spinner label="スケジュールを読み込んでいます" />;
  }

  return (
    <section aria-labelledby="schedule-list-heading">
      <h2 id="schedule-list-heading" className="text-xl font-bold">
        スケジュール一覧
      </h2>

      {error ? (
        <div className="mt-4">
          <Alert tone="danger" title="読み込みに失敗しました">
            <p>{error}</p>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => void load()}>
                再試行
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {!error && items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          登録されているスケジュールはありません。
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-4 border-t border-border">
          {items.map((schedule) => (
            <ScheduleRow key={schedule.id} schedule={schedule} />
          ))}
        </ul>
      ) : null}

      {hasMore ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void load(cursor)}
          >
            {loading ? '読み込み中…' : 'もっと読む'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
