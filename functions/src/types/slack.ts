/**
 * Slack 通知関連の型定義
 */

/**
 * Slack Attachment のフィールド
 */
export interface SlackField {
  title: string;
  value: string;
  short?: boolean;
}

/**
 * Slack Attachment
 */
export interface SlackAttachment {
  title?: string;
  title_link?: string;
  color?: 'good' | 'warning' | 'danger' | string;
  fields?: SlackField[];
}

/**
 * Slack Webhook ペイロード
 */
export interface SlackPayload {
  text?: string;
  channel?: string;
  attachments?: SlackAttachment[];
}
