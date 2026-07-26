/**
 * `schedules/{id}/archives` サブコレクションのドキュメント型。
 *
 * functions/src/types/firestore.ts の Archive と同じ形。フロント固有の追加は `id` のみ。
 *
 * このコレクションはクライアントから**書き込めない**（firestore.rules で
 * `allow write: if false`）。書き込むのは webCrawler だけなので、
 * ArchiveService にも作成・更新・削除のメソッドを置いていない。
 */
export interface Archive {
  /** Firestore の doc ID */
  id: string;
  /**
   * 取得したコンテンツ。crawler が `fetchAsHtml: true` で取った**生の HTML 断片**。
   * 描画する際は必ずテキストとして扱うこと（dangerouslySetInnerHTML は
   * eslint の react/no-danger で禁止している）。
   */
  content: string;
  /** 取得日時（ms epoch） */
  time: number;
}
