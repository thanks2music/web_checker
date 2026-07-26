'use client';

import { useEffect, useState } from 'react';

import { validateCron } from '@/lib/schedule/cron';
import { FREQUENCY_PRESETS, matchPreset } from '@/lib/schedule/frequency-presets';
import { formatJst } from '@/lib/utils/format-date';
import { SelectField, TextField } from '@/components/ui/field';

/**
 * 実行頻度の入力。
 *
 * ## プリセット主体にする理由
 *
 * スケジューラは毎時 5 分にしか起動しないので、実効頻度の上限は 1 時間に 1 回。
 * 生の cron を自由入力させると 10 分間隔などを指定でき、一見通るのに
 * 実際は 1 時間毎にしか動かない。プリセットならその齟齬が起きない。
 *
 * ## それでもカスタム入力を残す理由
 *
 * 既存ドキュメントにプリセット外の cron が入っている可能性がある。
 * 編集画面を開いたときに勝手にプリセットへ丸めると、保存しただけで
 * 監視頻度が変わってしまう。一致しない値は「カスタム」に落として原文を保つ。
 *
 * ## 次回実行予定を出す
 *
 * cron が読めない利用者でも設定の正しさを確認できるようにする。
 * backend と同じ cron-parser で算出しているので、表示と実挙動がずれない。
 */

const CUSTOM = '__custom__';

export function FrequencySelect({
  value,
  onChange,
  onValidityChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (cron: string) => void;
  /** cron が不正な間は送信させないため、親に妥当性を伝える */
  onValidityChange: (valid: boolean) => void;
  disabled?: boolean;
  error?: string;
}) {
  const preset = matchPreset(value);
  // 一度カスタムを選んだら、入力途中でプリセットと一致しても選択を戻さない
  // （入力中に select が勝手に切り替わると操作不能になるため）。
  const [customMode, setCustomMode] = useState(() => preset === undefined);
  const [cronError, setCronError] = useState<string | null>(null);
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await validateCron(value);
      if (cancelled) return;

      if (result.ok) {
        setCronError(null);
        setNextCheckAt(result.nextCheckAt.getTime());
        onValidityChange(true);
      } else {
        setCronError(result.reason);
        setNextCheckAt(null);
        onValidityChange(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value, onValidityChange]);

  const handlePresetChange = (selected: string) => {
    if (selected === CUSTOM) {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onChange(selected);
  };

  return (
    <div className="space-y-2">
      <SelectField
        label="実行頻度"
        value={customMode ? CUSTOM : value}
        disabled={disabled}
        onChange={(event) => handlePresetChange(event.target.value)}
        hint="スケジューラは毎時 05 分に起動するため、1 時間より短い間隔は指定しても効果がありません。"
      >
        {FREQUENCY_PRESETS.map((item) => (
          <option key={item.cron} value={item.cron}>
            {item.label}（{item.note}）
          </option>
        ))}
        <option value={CUSTOM}>カスタム（cron 式を直接入力）</option>
      </SelectField>

      {customMode ? (
        <TextField
          label="cron 式"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0 * * * *"
          error={cronError ?? error}
          hint={
            <>
              <a
                href="https://crontab.guru"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                crontab 形式
              </a>
              。タイムゾーンは JST で評価されます。
            </>
          }
        />
      ) : null}

      {nextCheckAt !== null ? (
        <p className="text-xs text-muted-foreground">
          次回のチェック: {formatJst(nextCheckAt)} ごろ
        </p>
      ) : null}
    </div>
  );
}
