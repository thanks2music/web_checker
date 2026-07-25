import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as functionsV1 from 'firebase-functions/v1';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { PubSub } from '@google-cloud/pubsub';
import { IncomingWebhook } from '@slack/webhook';

import webCrawlerLib from './webCrawler';
import webFetcherLib from './webFetcher';
import authUserLib from './userAuth';
import slackNotifierLib from './slackNotifier';
import { Schedule, SlackPayload } from './types';

// 環境変数（Firebase Functions v2 では params を使用）
const slackUrl = defineString('SLACK_URL');
const hostingUrl = defineString('HOSTING_URL', { default: '' });

// Firebase 初期化
initializeApp();
const firestore = getFirestore();
const auth = getAuth();
const pubsub = new PubSub();

// リージョン設定（無料枠を使用するため us-central1）
const REGION = 'us-central1';

/**
 * Hosting URL を取得するヘルパー
 */
const getHostingUrl = (): string => {
  if (hostingUrl.value()) {
    return hostingUrl.value();
  }
  const firebaseConfig = process.env.FIREBASE_CONFIG;
  const projectId =
    process.env.GCLOUD_PROJECT ??
    (firebaseConfig ? (JSON.parse(firebaseConfig) as { projectId?: string }).projectId : undefined);
  return `https://${projectId}.web.app`;
};

// 5分毎にスケジュール実行
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
}, async (event) => {
  const slack = new IncomingWebhook(slackUrl.value());
  await slackNotifierLib(slack, event.data.message.json);
});

// 新規ユーザー作成時にトリガー（v1 API を使用）
// ユーザーを無効化し、管理者に Slack 通知を送信
export const sendWelcomeEmail = functionsV1
  .region(REGION)
  .runWith({ timeoutSeconds: 300, memory: '128MB' })
  .auth.user()
  .onCreate(async (user) => {
    await authUserLib(auth, pubsub, user);
  });
