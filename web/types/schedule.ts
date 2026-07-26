/**
 * `schedules` コレクションのドキュメント型。
 *
 * functions/src/types/firestore.ts の Schedule と同じ形を保つ。Phase 2 で
 * Revolution monorepo に移した際、両者を shared/schemas へ統合する差分をゼロにするため。
 * フロント固有の追加は `id`（doc ID）のみ。
 *
 * ## タイムスタンプは number（ms epoch）で固定
 *
 * `checkedAt` / `createdAt` は Firestore の `Timestamp` ではなく素の number である。
 * backend が `new Date(schedule.checkedAt)` や cron-parser との比較で直接扱っており、
 * `serverTimestamp()` を混ぜると `Invalid Date` になって監視が壊れる。
 * @see functions/src/webFetcher.ts の isAlreadyChecked
 * @see functions/src/webCrawler.ts の formatJST
 *
 * ## 型と Firestore Rules の要求はずれている
 *
 * backend の interface では `createdUser` / `createdAt` が optional だが、実際には
 * どちらも欠かせない。前者は Rules の create 条件かつ update/delete のオーナー判定キー、
 * 後者は一覧クエリ `orderBy('createdAt','desc')` の対象で、持たない doc は
 * Firestore の仕様上クエリ結果から除外される。読み取り側は「欠けているかもしれない」
 * 前提で扱い、書き込み側（CreateScheduleInput）では必須として送る。
 * @see firestore.rules
 */
export interface Schedule {
  /** Firestore の doc ID */
  id: string;
  /** 監視対象 URL。Rules により https 限定 */
  uri: string;
  /** CSS セレクタ */
  selector: string;
  /** スケジュールのタイトル */
  title: string;
  /** cron 形式の実行頻度 */
  schedule: string;
  /** Slack 通知先チャンネル。空文字は「Webhook の既定チャンネル」を意味する */
  slack: string;
  /** 最終チェック日時（ms epoch）。**backend 専有**。クライアントは読むだけ */
  checkedAt: number | null;
  /** 作成日時（ms epoch）。一覧の並び順に使う */
  createdAt: number | null;
  /** 作成者の UID。Rules のオーナー判定キー */
  createdUser: string | null;
  /** 更新者の UID */
  updatedUser: string | null;
}

/**
 * 新規作成時にクライアントが指定する値。
 *
 * `createdUser` / `createdAt` は Service が付与するのでここには含めない。
 * `checkedAt` を意図的に除いてあるのが要点で、これを渡そうとすると
 * excess property check でコンパイルエラーになる。
 *
 * クライアントが `checkedAt` を書くと `isAlreadyChecked()` が
 * 「直近の cron 発火時刻より後にチェック済み」と判定し、**次の cron 境界まで
 * 定期監視がスキップされる**。現行の public/index.html はこれを書いており、
 * 実害が出ていないのは webCrawlerOnWrite が即座に初回クロールして
 * checkedAt を正しい値で上書きしているためにすぎない。
 */
export type CreateScheduleInput = Pick<
  Schedule,
  'uri' | 'selector' | 'title' | 'schedule' | 'slack'
>;

/**
 * 更新時にクライアントが指定する値。
 *
 * `createdUser` / `createdAt` / `checkedAt` は Rules 側でも変更が拒否される。
 * ここで型として除外しておくことで、実行時に permission-denied を食らう前に
 * コンパイル時点で気付ける。
 */
export type UpdateScheduleInput = Pick<
  Schedule,
  'uri' | 'selector' | 'title' | 'schedule' | 'slack'
>;
