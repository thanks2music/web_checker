'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth/auth-context';
import { mapAuthError } from '@/lib/auth/auth-error';
import { ScheduleService } from '@/lib/services/schedule.service';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { DeleteDialog } from '@/components/schedules/delete-dialog';
import { ScheduleCreateForm } from '@/components/schedules/schedule-create-form';
import { ScheduleRow } from '@/components/schedules/schedule-row';
import { ScheduleRowEditor } from '@/components/schedules/schedule-row-editor';
import type { Schedule } from '@/types/schedule';

/**
 * スケジュール一覧と CRUD。
 *
 * ## ページネーション方式
 *
 * 「次へ / 前へ」ではなく「もっと読む」の追記型。Firestore の startAfter は
 * 前方向が素直で、戻るには endBefore + limitToLast とカーソル履歴の管理が要る。
 * 監視ダッシュボードは新しい順に上から眺める用途なので、追記型で足りる。
 *
 * ## 編集の排他制御
 *
 * 同時に編集できるのは 1 行だけ（現行踏襲）。他行の編集・削除ボタンは
 * 無効化する。現行は「編集中は全行の削除ボタンを非表示」にしていたが、
 * 消えるより無効化の方が状態が読める。
 *
 * ## 保存後に再取得しない
 *
 * 現行は `location.href = 'index.html'` でページごと作り直していた。
 * ここでは手元の配列を差し替える。`createdAt` は編集で変わらないので
 * 並び順も壊れない。
 */

const PAGE_SIZE = 20;

export function ScheduleList() {
  const { uid } = useAuth();
  const [items, setItems] = useState<Schedule[]>([]);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      setItems((previous) =>
        cursorCreatedAt === undefined ? page.items : [...previous, ...page.items],
      );
      setHasMore(page.hasMore);
      setCursor(page.nextCursorCreatedAt ?? undefined);
    } catch (caught) {
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

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await ScheduleService.remove(deleteTarget.id);
      setItems((previous) => previous.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (caught) {
      setDeleteError(mapAuthError(caught)?.message ?? 'スケジュールの削除に失敗しました。');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && items.length === 0) {
    return <Spinner label="スケジュールを読み込んでいます" />;
  }

  return (
    <section aria-labelledby="schedule-list-heading">
      <h2 id="schedule-list-heading" className="text-xl font-bold">
        スケジュール一覧
      </h2>

      {/* 編集中は追加フォームを出さない。同時に 2 つの編集状態を持たせない。 */}
      {editingId === null ? (
        <ScheduleCreateForm
          onCreated={(created) => setItems((previous) => [created, ...previous])}
        />
      ) : null}

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

      {deleteError ? (
        <div className="mt-4">
          <Alert tone="danger" title="削除に失敗しました">
            {deleteError}
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
          {items.map((schedule) =>
            schedule.id === editingId ? (
              <ScheduleRowEditor
                key={schedule.id}
                schedule={schedule}
                onCancel={() => setEditingId(null)}
                onSaved={(updated) => {
                  setItems((previous) =>
                    previous.map((item) => (item.id === updated.id ? updated : item)),
                  );
                  setEditingId(null);
                }}
              />
            ) : (
              <ScheduleRow
                key={schedule.id}
                schedule={schedule}
                isOwner={schedule.createdUser !== null && schedule.createdUser === uid}
                actionsDisabled={editingId !== null}
                onEdit={() => setEditingId(schedule.id)}
                onDelete={() => {
                  setDeleteError(null);
                  setDeleteTarget(schedule);
                }}
              />
            ),
          )}
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

      {deleteTarget ? (
        <DeleteDialog
          title={deleteTarget.title}
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </section>
  );
}
