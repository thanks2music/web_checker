import { IncomingWebhook } from '@slack/webhook';
import { SlackPayload } from './types';

/**
 * Slack に通知を送信する
 * @param slack IncomingWebhook インスタンス
 * @param message 送信するメッセージ（SlackPayload 形式）
 */
const slackNotifierLib = async (slack: IncomingWebhook, message: SlackPayload): Promise<void> => {
  console.log('send to slack', message);
  await slack.send(message);
};

export default slackNotifierLib;
