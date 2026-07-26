import { scheduleFormSchema, type ScheduleFormValues } from '@/lib/schemas/schedule-form.schema';
import type { ScheduleFieldErrors } from '@/components/schedules/schedule-fields';

/**
 * Zod の結果をフィールド単位のエラーへ変換する。
 *
 * 現行実装は 4 項目をまとめて 1 つの正規表現で判定し、
 * `alert('すべての項目を入力してください')` という単一メッセージしか出していなかった。
 * どの項目がなぜ駄目なのか分からず、URL の形式ミスと未入力も区別できない。
 *
 * 作成と編集の双方から使う。現行では編集時にバリデーションが一切なく、
 * 空文字や不正 URL に上書きできてしまっていた。
 */
export function validateScheduleForm(
  values: ScheduleFormValues,
): { ok: true; data: ScheduleFormValues } | { ok: false; errors: ScheduleFieldErrors } {
  const result = scheduleFormSchema.safeParse(values);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: ScheduleFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string') continue;
    // 最初のエラーだけ出す。同じ項目に複数出しても直す順番が分かりにくいだけ。
    if (!(field in errors)) {
      errors[field as keyof ScheduleFormValues] = issue.message;
    }
  }

  return { ok: false, errors };
}
