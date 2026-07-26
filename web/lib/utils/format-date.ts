/**
 * 日時表示は JST 固定。
 *
 * 現行 public/index.html は `new Date(x).toLocaleString()` を使っており、
 * ブラウザのロケールとタイムゾーンに依存していた。一方 backend は
 * `toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })` で JST 固定なので、
 * 海外から見ると Slack 通知と画面で違う時刻が出る。cron の評価も
 * `tz: 'Asia/Tokyo'` なので、ここを固定しないと「9 時に設定したのに
 * 別の時刻が表示される」ことになる。
 *
 * @see functions/src/webCrawler.ts の formatJST
 */

const JST_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

/** 未取得を表す表示。現行 UI の `-` を踏襲する。 */
export const EMPTY_DATE_LABEL = '-';

/**
 * ms epoch を JST の文字列にする。null / 不正値は `-`。
 *
 * マッパが既に number | null へ正規化しているので、ここに来る不正値は
 * 想定していないが、表示層が例外で落ちると画面ごと消えるため防御しておく。
 */
export function formatJst(epochMillis: number | null | undefined): string {
  if (typeof epochMillis !== 'number' || !Number.isFinite(epochMillis)) {
    return EMPTY_DATE_LABEL;
  }

  const date = new Date(epochMillis);
  if (Number.isNaN(date.getTime())) return EMPTY_DATE_LABEL;

  return date.toLocaleString('ja-JP', JST_FORMAT);
}
