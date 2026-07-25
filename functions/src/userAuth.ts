import { PubSub } from '@google-cloud/pubsub';
import type { AuthUserRecord } from 'firebase-functions/v2/identity';
import { SlackPayload } from './types';

/**
 * 新規ユーザー登録時の処理
 *
 * v2 blocking function (`beforeUserCreated`) から呼び出される。
 * blocking function 自身が `{ disabled: true }` を返すことで作成時点から
 * ユーザーを無効化するため、この関数は Slack 通知のみを担当する。
 *
 * @param pubsub PubSub インスタンス
 * @param user 作成されるユーザー情報
 */
const userAuth = async (pubsub: PubSub, user: AuthUserRecord): Promise<void> => {
  console.log('registered new user: ', user.email);

  const slackPayload: SlackPayload = {
    text: `[WEB CHECKER] ユーザが新規登録されました`,
    attachments: [{
      title: '有効なユーザの場合、Firebase コンソールからアカウントを有効化し、カスタムクレームを設定してください',
      title_link: 'https://console.firebase.google.com',
      fields: [
        { title: 'email', value: user.email || '(不明)' },
        { title: 'name', value: user.displayName || '(不明)' },
        { title: 'uid', value: user.uid },
      ],
    }],
  };
  const data = JSON.stringify(slackPayload);
  const dataBuffer = Buffer.from(data);
  await pubsub.topic('slackNotifier').publish(dataBuffer);
};

export default userAuth;
