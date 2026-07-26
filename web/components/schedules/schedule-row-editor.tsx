'use client';

import { useState } from 'react';

import { useAuth } from '@/lib/auth/auth-context';
import { mapAuthError } from '@/lib/auth/auth-error';
import { validateScheduleForm } from '@/lib/schemas/validate-schedule-form';
import { ScheduleService } from '@/lib/services/schedule.service';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  ScheduleFields,
  type ScheduleFieldErrors,
} from '@/components/schedules/schedule-fields';
import type { Schedule } from '@/types/schedule';

/**
 * 行のインライン編集。
 *
 * ## 下書きはこのコンポーネントの state に閉じる
 *
 * キャンセルは親が editingId を null にしてアンマウントするだけで済み、
 * 値の復元処理が要らない。現行実装は各 input に `data-value` を持たせて
 * キャンセル時に 1 つずつ書き戻しており、そこがバグの温床になっていた。
 *
 * ## 保存で送るのは 6 フィールドのみ
 *
 * ScheduleService.update が `createdUser` / `createdAt` / `checkedAt` に触れない。
 * Rules 側も hasOnly で同じ 6 キーに制限している。
 */
export function ScheduleRowEditor({
  schedule,
  onSaved,
  onCancel,
}: {
  schedule: Schedule;
  onSaved: (updated: Schedule) => void;
  onCancel: () => void;
}) {
  const { uid } = useAuth();
  const [values, setValues] = useState({
    title: schedule.title,
    uri: schedule.uri,
    selector: schedule.selector,
    slack: schedule.slack,
    schedule: schedule.schedule,
  });
  const [errors, setErrors] = useState<ScheduleFieldErrors>({});
  const [cronValid, setCronValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // uri か selector を変えると webCrawlerOnWrite が即座に再クロールする。
  // 保存前に知らせておかないと、意図しないタイミングで通知が飛んで驚かせる。
  const willRecrawl = values.uri !== schedule.uri || values.selector !== schedule.selector;

  const handleSubmit = async () => {
    // 入力検証を先に行う。uid の有無で早期 return すると、
    // 押しても何も起きないボタンになって原因が分からなくなる。
    const validation = validateScheduleForm(values);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});

    if (!uid) {
      // AuthGuard を通っていれば起きないが、握り潰さず状態を見せる。
      setFailure('ログイン状態を確認できませんでした。再読み込みしてください。');
      return;
    }

    setSaving(true);
    setFailure(null);

    try {
      await ScheduleService.update(schedule.id, validation.data, uid);
      onSaved({ ...schedule, ...validation.data, updatedUser: uid });
    } catch (caught) {
      // 他人が作成したスケジュールを編集しようとすると Rules に弾かれる。
      setFailure(mapAuthError(caught)?.message ?? 'スケジュールの保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="border-b border-border bg-secondary/40 px-4 py-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <h3 className="font-semibold">スケジュールを編集</h3>

        <div className="mt-4">
          <ScheduleFields
            values={values}
            errors={errors}
            disabled={saving}
            onChange={(patch) => setValues((previous) => ({ ...previous, ...patch }))}
            onCronValidityChange={setCronValid}
          />
        </div>

        {willRecrawl ? (
          <div className="mt-4">
            <Alert tone="warning">
              URL またはセレクタを変更したため、保存すると即座に再チェックが実行されます。
            </Alert>
          </div>
        ) : null}

        {failure ? (
          <div className="mt-4">
            <Alert tone="danger" title="保存に失敗しました">
              {failure}
            </Alert>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button type="submit" disabled={saving || !cronValid}>
            {saving ? '保存中…' : '保存'}
          </Button>
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </form>
    </li>
  );
}
