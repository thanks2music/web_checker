/**
 * Firestore ドキュメントの型定義
 */

/**
 * schedules コレクションのドキュメント
 */
export interface Schedule {
  /** 監視対象 URL */
  uri: string;
  /** CSS セレクタ */
  selector: string;
  /** スケジュールのタイトル */
  title: string;
  /** cron 形式のスケジュール */
  schedule: string;
  /** Slack 通知先チャンネル（省略可） */
  slack?: string;
  /** 最終チェック日時（Unix timestamp） */
  checkedAt?: number;
  /** 作成日時（Unix timestamp） */
  createdAt?: number;
  /** 作成者の UID（Firestore Rules のオーナーチェックに使用） */
  createdUser?: string;
  /** 更新者の UID */
  updatedUser?: string;
}

/**
 * archives サブコレクションのドキュメント
 */
export interface Archive {
  /** 取得したコンテンツ */
  content: string;
  /** 取得日時（Unix timestamp） */
  time: number;
}
