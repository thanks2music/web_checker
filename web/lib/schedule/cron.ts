/**
 * cron 式の検証と次回実行時刻の算出。
 *
 * ## backend と同じライブラリ・同じ tz で判定する
 *
 * 正規表現で構文チェックする案もあるが、それだと backend の cron-parser が
 * invalid と判定して既定値にフォールバックするケース（例: `0 25 * * *`）を
 * フロントが通してしまう。結果は「保存できたのに設定した時刻に動かない」という
 * 最悪のサイレント故障になる。判定の不一致を構造的に無くすため、
 * backend と同一の cron-parser v4 を `tz: 'Asia/Tokyo'` で使う。
 * @see functions/src/webFetcher.ts の isAlreadyChecked
 *
 * ## バージョンは v4 に固定
 *
 * cron-parser v5 は API が `CronExpressionParser.parse` に変わっている。
 * backend が `^4.9.0` なので web も 4 系に合わせる。両方を v5 に上げるのは
 * backend の挙動が変わりうるため別 PR で扱う。
 *
 * ## dynamic import する理由
 *
 * cron-parser は luxon に依存していて軽くない。プリセットを選ぶだけのユーザーに
 * その重量を負わせないよう、実際に検証が要る場面で初めて読み込む。
 */

export type CronValidation =
  | { ok: true; nextRun: Date }
  | { ok: false; reason: string };

/** backend と揃えた評価タイムゾーン。 */
const CRON_TZ = 'Asia/Tokyo';

/**
 * cron 式を検証し、妥当なら次回実行時刻（JST 基準）を返す。
 *
 * 返す `nextRun` は cron 式そのものの次回発火時刻であり、実際にクロールが走る
 * 時刻とは最大 1 時間ずれる（スケジューラが毎時 05 分にしか起動しないため）。
 * UI では「◯◯ ごろ」と丸めて見せること。
 */
export async function validateCron(expression: string): Promise<CronValidation> {
  const trimmed = expression.trim();
  if (trimmed === '') {
    return { ok: false, reason: '実行頻度を入力してください' };
  }

  const { default: cronParser } = await import('cron-parser');

  try {
    const interval = cronParser.parseExpression(trimmed, { tz: CRON_TZ });
    return { ok: true, nextRun: interval.next().toDate() };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'cron 式が不正です',
    };
  }
}
