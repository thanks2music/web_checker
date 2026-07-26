'use client';

import { useState } from 'react';

import { useAuth } from '@/lib/auth/auth-context';
import { mapAuthError } from '@/lib/auth/auth-error';
import { validateScheduleForm } from '@/lib/schemas/validate-schedule-form';
import { ScheduleService } from '@/lib/services/schedule.service';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  EMPTY_FORM,
  ScheduleFields,
  type ScheduleFieldErrors,
} from '@/components/schedules/schedule-fields';
import type { Schedule } from '@/types/schedule';

/**
 * 新規追加フォーム。
 *
 * `<form>` として実装するので Enter で送信できる。現行実装はテーブル行に
 * input を並べただけで form 要素が無く、Enter が効かなかった。
 *
 * 保存後はページ全体をリロードしない。現行は `location.href = 'index.html'` で
 * 作り直していたが、追加した 1 件を先頭に挿すだけで済む
 * （`createdAt` 降順なので新規は必ず先頭に来る）。
 */
export function ScheduleCreateForm({ onCreated }: { onCreated: (schedule: Schedule) => void }) {
  const { uid } = useAuth();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<ScheduleFieldErrors>({});
  const [cronValid, setCronValid] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reset = () => {
    setValues(EMPTY_FORM);
    setErrors({});
    setFailure(null);
  };

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

    setSubmitting(true);
    setFailure(null);

    try {
      const id = await ScheduleService.create(validation.data, uid);

      // 楽観的に組み立てず、送った値と Service が付けた値から手元で構築する。
      // 作成直後に webCrawlerOnWrite が走って checkedAt が入るが、
      // それは次回の読み込みで反映されれば十分。
      onCreated({
        id,
        ...validation.data,
        checkedAt: null,
        createdAt: Date.now(),
        createdUser: uid,
        updatedUser: null,
      });

      reset();
      setOpen(false);
    } catch (caught) {
      setFailure(mapAuthError(caught)?.message ?? 'スケジュールの追加に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-4">
        <Button onClick={() => setOpen(true)}>スケジュールを追加</Button>
      </div>
    );
  }

  return (
    <form
      className="mt-4 rounded-md border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <h3 className="font-semibold">スケジュールを追加</h3>

      <p className="mt-1 text-xs text-muted-foreground">
        追加すると、その場で 1 回目のチェックが実行されます。
      </p>

      <div className="mt-4">
        <ScheduleFields
          values={values}
          errors={errors}
          disabled={submitting}
          onChange={(patch) => setValues((previous) => ({ ...previous, ...patch }))}
          onCronValidityChange={setCronValid}
        />
      </div>

      {failure ? (
        <div className="mt-4">
          <Alert tone="danger" title="追加に失敗しました">
            {failure}
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={submitting || !cronValid}>
          {submitting ? '追加中…' : '追加'}
        </Button>
        <Button
          variant="ghost"
          disabled={submitting}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
