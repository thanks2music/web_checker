import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { beforeUserCreated } from 'firebase-functions/v2/identity';
import { defineSecret } from 'firebase-functions/params';
import { PubSub } from '@google-cloud/pubsub';
import { IncomingWebhook } from '@slack/webhook';

import webCrawlerLib from './webCrawler';
import webFetcherLib from './webFetcher';
import authUserLib from './userAuth';
import slackNotifierLib from './slackNotifier';
import { Schedule, SlackPayload } from './types';

// Slack Incoming Webhook URL. Stored in Cloud Secret Manager and mounted at
// runtime on the functions that actually send Slack notifications.
const slackUrl = defineSecret('SLACK_URL_REVOLUTION_WEB_CHECKER');

// Firebase 初期化
initializeApp();
const firestore = getFirestore();
const pubsub = new PubSub();

// リージョン設定（無料枠を使用するため us-central1）
const REGION = 'us-central1';

/**
 * Hosting URL を取得するヘルパー
 *
 * Cloud Functions ランタイム上では `GCLOUD_PROJECT` が常に設定されるため、
 * それを Firebase Hosting の予約 URL 形式に流し込む。フォールバックとして
 * `FIREBASE_CONFIG` からも projectId を読める形にしておく。
 */
const getHostingUrl = (): string => {
  const firebaseConfig = process.env.FIREBASE_CONFIG;
  const projectId =
    process.env.GCLOUD_PROJECT ??
    (firebaseConfig ? (JSON.parse(firebaseConfig) as { projectId?: string }).projectId : undefined);
  return `https://${projectId}.web.app`;
};

// スケジュール定期実行（毎時 5 分に起動）
export const webFetcher = onSchedule({
  schedule: '5 * * * *',
  timeoutSeconds: 300,
  memory: '128MiB',
  region: REGION,
}, async () => {
  await webFetcherLib(firestore, pubsub);
});

// webChecker トピックを購読
export const webCrawler = onMessagePublished<{ scheduleId: string }>({
  topic: 'webChecker',
  timeoutSeconds: 300,
  memory: '256MiB',
  region: REGION,
}, async (event) => {
  const scheduleId = event.data.message.json.scheduleId;
  await webCrawlerLib(firestore, pubsub, scheduleId, getHostingUrl());
});

// schedules ドキュメントの書き込み時にトリガー
export const webCrawlerOnWrite = onDocumentWritten({
  document: 'schedules/{scheduleID}',
  timeoutSeconds: 300,
  memory: '256MiB',
  region: REGION,
}, async (event) => {
  const afterData = event.data?.after?.data() as Schedule | undefined;
  const beforeData = event.data?.before?.data() as Schedule | undefined;

  if (afterData) {
    if (!beforeData ||
        beforeData.uri !== afterData.uri ||
        beforeData.selector !== afterData.selector) {
      const scheduleId = event.params.scheduleID;
      await webCrawlerLib(firestore, pubsub, scheduleId, getHostingUrl());
    }
  }
});

// slackNotifier トピックを購読
export const slackNotifier = onMessagePublished<SlackPayload>({
  topic: 'slackNotifier',
  timeoutSeconds: 300,
  memory: '128MiB',
  region: REGION,
  secrets: [slackUrl],
}, async (event) => {
  const slack = new IncomingWebhook(slackUrl.value());
  await slackNotifierLib(slack, event.data.message.json);
});

/**
 * 新規ユーザー作成 (blocking function)
 *
 * v2 blocking function `beforeUserCreated` として、Firebase Authentication
 * (Identity Platform) からユーザー作成前に呼ばれる。以下 2 点を行う:
 *
 * 1. `{ disabled: true }` を返し、管理者による承認までアカウントを無効化する
 * 2. 管理者に Slack 通知を PubSub 経由で送る
 *
 * ⚠ 有効化には Firebase Console → Authentication → Settings →
 * Blocking functions → `beforeCreate` に本関数を登録する必要がある。
 */
export const beforeCreate = beforeUserCreated({
  region: REGION,
  timeoutSeconds: 60,
}, async (event) => {
  const user = event.data;
  if (user) {
    await authUserLib(pubsub, user);
  }
  return { disabled: true };
});
