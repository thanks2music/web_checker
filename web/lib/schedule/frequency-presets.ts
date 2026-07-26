import { DEFAULT_CRON } from '@/lib/firestore/mappers';

/**
 * 実行頻度のプリセット。
 *
 * ## 保存値は cron 文字列のまま
 *
 * Firestore の `schedule` フィールドは cron 文字列であり、backend の
 * `isAlreadyChecked()` が cron-parser で評価している。プリセットはあくまで
 * 入力 UI の都合なので、データモデルには一切影響させない。
 *
 * ## なぜ生の cron 直接入力から離れるのか
 *
 * グローバルのスケジューラ（webFetcher）は `'5 * * * *'` = 毎時 5 分にしか起動しない。
 * 各スケジュールの cron はその瞬間に「実行すべきか」を判定するだけなので、
 * **実効頻度の上限は 1 時間に 1 回**である。10 分間隔を意図した指定は
 * 一見 10 分毎に見えて実際は 1 時間毎にしか動かず、ユーザーの期待と必ずずれる。
 * プリセットを主にすることでこの落とし穴を構造的に避ける。
 * @see functions/src/index.ts の webFetcher（schedule: '5 * * * *'）
 * @see functions/src/webFetcher.ts の isAlreadyChecked
 *
 * ## タイムゾーンは JST 固定
 *
 * backend が `cronParser.parseExpression(expr, { tz: 'Asia/Tokyo' })` で評価するため、
 * 「1 日 1 回（朝 9 時）」は JST の 9 時を意味する。
 */
export interface FrequencyPreset {
  /** UI に出すラベル */
  label: string;
  /** Firestore に保存する cron 文字列 */
  cron: string;
  /** 実際に動くタイミングの補足（毎時 5 分起動を織り込んだ説明） */
  note: string;
}

export const FREQUENCY_PRESETS: readonly FrequencyPreset[] = [
  { label: '1 時間に 1 回', cron: DEFAULT_CRON, note: '毎時 05 分ごろ' },
  { label: '3 時間に 1 回', cron: '0 */3 * * *', note: '0/3/6/9/12/15/18/21 時の 05 分ごろ' },
  { label: '6 時間に 1 回', cron: '0 */6 * * *', note: '0/6/12/18 時の 05 分ごろ' },
  { label: '1 日 1 回（朝 9 時）', cron: '0 9 * * *', note: '毎日 9:05 ごろ' },
  { label: '1 日 1 回（夜 21 時）', cron: '0 21 * * *', note: '毎日 21:05 ごろ' },
  { label: '平日のみ 1 日 1 回（朝 9 時）', cron: '0 9 * * 1-5', note: '月〜金 9:05 ごろ' },
  { label: '週 1 回（月曜 9 時）', cron: '0 9 * * 1', note: '毎週月曜 9:05 ごろ' },
] as const;

/**
 * cron 文字列に対応するプリセットを返す。無ければ undefined（= カスタム扱い）。
 *
 * 既存ドキュメントにはプリセットに無い cron が入っている可能性がある。
 * 編集画面を開いただけで勝手にプリセット値へ丸めると、ユーザーが意図せず
 * 監視頻度を変えてしまうため、一致しない値は「カスタム」として原文のまま扱う。
 */
export function matchPreset(cron: string): FrequencyPreset | undefined {
  const normalized = cron.trim().replace(/\s+/g, ' ');
  return FREQUENCY_PRESETS.find((preset) => preset.cron === normalized);
}
