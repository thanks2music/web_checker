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
  | { ok: true; nextCheckAt: Date }
  | { ok: false; reason: string };

/** backend と揃えた評価タイムゾーン。 */
const CRON_TZ = 'Asia/Tokyo';

/**
 * webFetcher が起動する分。`'5 * * * *'` に対応する。
 * @see functions/src/index.ts
 */
const SCHEDULER_MINUTE = 5;

/**
 * cron の発火時刻から、実際にクロールが走る時刻を求める。
 *
 * スケジューラは毎時 05 分にしか起動せず、その瞬間に各スケジュールが
 * 「直近の cron 発火時刻より後にチェック済みか」を判定する。したがって
 * 実際のチェックは **cron 発火時刻以降で最初に来る :05** になる。
 * cron が 9:00 を指していても実行は 9:05、9:30 を指していれば 10:05。
 *
 * この差を無視して cron の発火時刻をそのまま見せると、頻度の注記
 * （「毎時 05 分ごろ」）と食い違って利用者を混乱させる。
 */
function toNextSchedulerTick(cronFireAt: Date): Date {
  const tick = new Date(cronFireAt);
  tick.setSeconds(0, 0);

  if (tick.getMinutes() <= SCHEDULER_MINUTE) {
    tick.setMinutes(SCHEDULER_MINUTE);
  } else {
    // その時間の :05 は過ぎているので次の時間へ送る。
    tick.setHours(tick.getHours() + 1, SCHEDULER_MINUTE);
  }

  return tick;
}

/**
 * cron 式を検証し、妥当なら次に実際チェックが走る時刻（JST 基準）を返す。
 *
 * 返すのは cron の理論上の発火時刻ではなく、スケジューラの起動間隔を
 * 織り込んだ時刻。利用者が知りたいのは「いつ見に行ってくれるか」だから。
 */
export async function validateCron(expression: string): Promise<CronValidation> {
  const trimmed = expression.trim();
  if (trimmed === '') {
    return { ok: false, reason: '実行頻度を入力してください' };
  }

  const { default: cronParser } = await import('cron-parser');

  try {
    const interval = cronParser.parseExpression(trimmed, { tz: CRON_TZ });
    return { ok: true, nextCheckAt: toNextSchedulerTick(interval.next().toDate()) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'cron 式が不正です',
    };
  }
}
