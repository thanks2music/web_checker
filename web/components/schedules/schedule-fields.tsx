'use client';

import { DEFAULT_CRON } from '@/lib/firestore/mappers';
import type { ScheduleFormValues } from '@/lib/schemas/schedule-form.schema';
import { FrequencySelect } from '@/components/schedules/frequency-select';
import { TextField } from '@/components/ui/field';

/**
 * 作成と編集で共有する入力群。
 *
 * 現行実装は新規追加行と編集行で同じ 5 フィールドを HTML に 2 回書いており、
 * 片方だけ直される事故が起きやすかった。ここは 1 箇所に集約する。
 *
 * バリデーションは呼び出し側が Zod で行い、結果を errors として渡す。
 * この層は表示に徹する。
 */

export const EMPTY_FORM: ScheduleFormValues = {
  title: '',
  uri: 'https://',
  selector: '',
  slack: '',
  schedule: DEFAULT_CRON,
};

export type ScheduleFieldErrors = Partial<Record<keyof ScheduleFormValues, string>>;

export function ScheduleFields({
  values,
  errors,
  disabled,
  onChange,
  onCronValidityChange,
}: {
  values: ScheduleFormValues;
  errors: ScheduleFieldErrors;
  disabled?: boolean;
  onChange: (patch: Partial<ScheduleFormValues>) => void;
  onCronValidityChange: (valid: boolean) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="タイトル"
        value={values.title}
        disabled={disabled}
        error={errors.title}
        onChange={(event) => onChange({ title: event.target.value })}
      />

      <TextField
        label="監視する URL"
        value={values.uri}
        disabled={disabled}
        error={errors.uri}
        onChange={(event) => onChange({ uri: event.target.value })}
        placeholder="https://"
        // https 限定は Firestore Rules 側でも強制している。crawler にスキーム検証も
        // private IP ブロックも無く、uri を変えると Admin 権限で即座に fetch されるため。
        hint="https:// で始まる URL のみ指定できます。"
      />

      <TextField
        label="CSS セレクタ"
        value={values.selector}
        disabled={disabled}
        error={errors.selector}
        onChange={(event) => onChange({ selector: event.target.value })}
        placeholder="#hoge, .bar:nth-child(3)"
        hint="監視したい要素を CSS3 セレクタで指定します。"
      />

      <TextField
        label="Slack 通知先"
        value={values.slack}
        disabled={disabled}
        error={errors.slack}
        onChange={(event) => onChange({ slack: event.target.value })}
        placeholder="#channel-name"
        hint="空欄の場合は Webhook の既定チャンネルへ通知します。"
      />

      <div className="sm:col-span-2">
        <FrequencySelect
          value={values.schedule}
          disabled={disabled}
          error={errors.schedule}
          onChange={(schedule) => onChange({ schedule })}
          onValidityChange={onCronValidityChange}
        />
      </div>
    </div>
  );
}
