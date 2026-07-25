import { Auth, UserRecord } from 'firebase-admin/auth';
import { PubSub } from '@google-cloud/pubsub';
import { SlackPayload } from './types';

/**
 * 新規ユーザー登録時の処理
 * - ユーザーを無効化
 * - 管理者に Slack 通知
 * @param auth Firebase Auth インスタンス
 * @param pubsub PubSub インスタンス
 * @param user 登録されたユーザー情報
 */
const userAuth = async (auth: Auth, pubsub: PubSub, user: UserRecord): Promise<void> => {
  console.log('registered new user: ', user.email);

  // 新規ユーザーを無効化（管理者が手動で有効化するまで）
  await auth.updateUser(user.uid, { disabled: true });

  // 管理者に Slack 通知
  const slackPayload: SlackPayload = {
    text: `[WEB CHECKER] ユーザが新規登録されました`,
    attachments: [{
      title: "有効なユーザの場合、Firebase コンソールからアカウントを有効化し、カスタムクレームを設定してください",
      title_link: "https://console.firebase.google.com",
      fields: [
        { title: "email", value: user.email || '(不明)' },
        { title: "name", value: user.displayName || '(不明)' },
        { title: "uid", value: user.uid }
      ]
    }]
  };
  const data = JSON.stringify(slackPayload);
  const dataBuffer = Buffer.from(data);
  await pubsub.topic('slackNotifier').publish(dataBuffer);
};

export default userAuth;
