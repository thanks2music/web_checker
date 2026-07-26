/**
 * `?scheduleId=` の検証。
 *
 * この画面は Slack 通知の「差分一覧」リンクから直接開かれる導線を持つ。
 * @see functions/src/webCrawler.ts の slackFormat
 *
 * 現行 public/detail.html は `/^[a-zA-Z0-9]+$/` で検証していた。Firestore の
 * 自動 ID は 20 文字の英数字なので通るが、手動で付けた ID には `-` や `_` が
 * 入りうるため少し広げる。
 *
 * 上限は Firestore のドキュメント ID 制限（1500 バイト）に合わせる。
 * `/` を弾くのが最も重要で、含まれるとサブコレクションのパスが壊れる。
 * 文字種を英数字とハイフン・アンダースコアに限っている時点で除外されるが、
 * 意図として記録しておく。
 */
const SCHEDULE_ID_PATTERN = /^[A-Za-z0-9_-]{1,1500}$/;

export function isValidScheduleId(value: string | null | undefined): value is string {
  return typeof value === 'string' && SCHEDULE_ID_PATTERN.test(value);
}
