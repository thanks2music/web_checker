import Link from 'next/link';

import { formatJst } from '@/lib/utils/format-date';
import { matchPreset } from '@/lib/schedule/frequency-presets';
import { Button } from '@/components/ui/button';
import type { Schedule } from '@/types/schedule';

/**
 * 一覧の 1 行（表示モード）。
 *
 * 現行はテーブルの各セルに readonly の `<input>` を並べて表示していたが、
 * 読み取り専用の値をフォーム要素で見せる必然性がなく、タブ順にも入ってしまう。
 * ここでは通常のテキストとして描き、編集は ScheduleRowEditor に分ける。
 *
 * cron はプリセットに一致すればラベルで、しなければ生の式のまま見せる。
 * 既存データにプリセット外の式が入っている可能性があり、勝手に丸めると
 * 「開いただけで頻度が変わった」ように見えてしまうため。
 */
export function ScheduleRow({
  schedule,
  isOwner,
  actionsDisabled,
  onEdit,
  onDelete,
}: {
  schedule: Schedule;
  /** 所有者のみ編集・削除できる（Firestore Rules と同じ条件） */
  isOwner: boolean;
  /** 他の行が編集中はボタンを無効化する */
  actionsDisabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const preset = matchPreset(schedule.schedule);

  return (
    <li className="border-b border-border px-4 py-4">
      {/*
        flex-wrap は使わない。長い URL を持つ行だけ操作列が下へ回り込み、
        行ごとにボタン位置が変わって視線が定まらなくなるため。
        本文側は min-w-0 + break-all で縮められるので、折り返さなくても溢れない。
      */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{schedule.title}</h3>

          {/* 監視対象は外部サイト。noreferrer まで付けて参照元を渡さない。 */}
          <a
            href={schedule.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block break-all text-sm text-primary underline"
          >
            {schedule.uri}
          </a>

          <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-[auto_1fr]">
            <dt className="font-medium">セレクタ</dt>
            <dd className="break-all">
              <code>{schedule.selector}</code>
            </dd>

            <dt className="font-medium">実行頻度</dt>
            <dd>
              {preset ? (
                <>
                  {preset.label}
                  <span className="ml-1 opacity-70">（{preset.note}）</span>
                </>
              ) : (
                <code>{schedule.schedule}</code>
              )}
            </dd>

            <dt className="font-medium">通知先</dt>
            <dd>{schedule.slack === '' ? '既定のチャンネル' : schedule.slack}</dd>

            <dt className="font-medium">最終チェック</dt>
            <dd>{formatJst(schedule.checkedAt)}</dd>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Link
            href={`/detail?scheduleId=${encodeURIComponent(schedule.id)}`}
            className="text-sm text-primary underline"
          >
            履歴
          </Link>

          {/*
            所有者でなければ編集・削除ボタンを出さない。Rules 側でも弾かれるが、
            現行 UI は全行にボタンを出していて、押して初めて失敗する作りだった。
          */}
          {isOwner ? (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={actionsDisabled} onClick={onEdit}>
                編集
              </Button>
              <Button variant="destructive" disabled={actionsDisabled} onClick={onDelete}>
                削除
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
