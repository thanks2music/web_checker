const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const functionsV1 = require('firebase-functions/v1');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onMessagePublished } = require('firebase-functions/v2/pubsub');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineString } = require('firebase-functions/params');
const { PubSub } = require('@google-cloud/pubsub');

const { IncomingWebhook } = require('@slack/webhook');

// Firebase 初期化
initializeApp();
const firestore = getFirestore();
const auth = getAuth();
const pubsub = new PubSub();

// リージョン設定（Firestore と同じリージョンを使用）
const REGION = 'asia-northeast1';

// 環境変数（Firebase Functions v2 では params を使用）
const slackUrl = defineString('SLACK_URL');
const hostingUrl = defineString('HOSTING_URL', { default: '' });

const webCrawlerLib = require('./webCrawler');
const webFetcherLib = require('./webFetcher');
const authUserLib = require('./userAuth');
const slackNotifierLib = require('./slackNotifier');

// Hosting URL を取得するヘルパー
const getHostingUrl = () => {
  if (hostingUrl.value()) {
    return hostingUrl.value();
  }
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG && JSON.parse(process.env.FIREBASE_CONFIG).projectId;
  return `https://${projectId}.web.app`;
};

// 5分毎にスケジュール実行
exports.webFetcher = onSchedule({
  schedule: '5 * * * *',
  timeoutSeconds: 300,
  memory: '128MiB',
  region: REGION,
}, async (event) => {
  await webFetcherLib(firestore, pubsub);
});

// webChecker トピックを購読
exports.webCrawler = onMessagePublished({
  topic: 'webChecker',
  timeoutSeconds: 300,
  memory: '256MiB',
  region: REGION,
}, async (event) => {
  const scheduleId = event.data.message.json.scheduleId;
  await webCrawlerLib(firestore, pubsub, scheduleId, getHostingUrl());
});

// schedules ドキュメントの書き込み時にトリガー
exports.webCrawlerOnWrite = onDocumentWritten({
  document: 'schedules/{scheduleID}',
  timeoutSeconds: 300,
  memory: '256MiB',
  region: REGION,
}, async (event) => {
  const afterData = event.data?.after?.data();
  const beforeData = event.data?.before?.data();

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
exports.slackNotifier = onMessagePublished({
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
exports.sendWelcomeEmail = functionsV1
  .region(REGION)
  .runWith({ timeoutSeconds: 300, memory: '128MB' })
  .auth.user()
  .onCreate(async (user) => {
    await authUserLib(auth, pubsub, user);
  });
