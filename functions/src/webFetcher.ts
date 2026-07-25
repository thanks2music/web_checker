import cronParser from 'cron-parser';
import { Firestore } from 'firebase-admin/firestore';
import { PubSub } from '@google-cloud/pubsub';
import { Schedule } from './types';

// スケジュールに cron が入っていない・不正な場合の既定値: 1 時間に 1 回。
const DEFAULT_CRON = '0 * * * *';

/**
 * スケジュールがすでにチェック済みかどうかを判定する。
 *
 * 各スケジュール自身の cron 式を評価し、「前回の cron イベント時刻より後に
 * checkedAt が更新されていればスキップ」する。グローバルスケジューラ
 * (`webFetcher`) は毎時 5 分に起動されるため、これより短い間隔を指定しても
 * 実効頻度は 1 時間 1 回が上限となる。
 */
const isAlreadyChecked = (schedule: Schedule): boolean => {
  if (typeof schedule.checkedAt === 'undefined') {
    return false;
  }

  const cronExpr = schedule.schedule || DEFAULT_CRON;
  let prev: Date;
  try {
    prev = cronParser.parseExpression(cronExpr, {
      tz: 'Asia/Tokyo',
    }).prev().toDate();
  } catch (err) {
    console.warn(`invalid cron expression: "${cronExpr}", falling back to default`, err);
    prev = cronParser.parseExpression(DEFAULT_CRON, {
      tz: 'Asia/Tokyo',
    }).prev().toDate();
  }

  const checked = new Date(schedule.checkedAt);
  return prev < checked;
};

/**
 * スケジュールを走査し、チェックが必要なものを webChecker トピックに発行
 * @param firestore Firestore インスタンス
 * @param pubsub PubSub インスタンス
 */
const webFetcher = async (firestore: Firestore, pubsub: PubSub): Promise<void> => {
  const schedules = await firestore.collection('schedules').get();

  const publishPromises = schedules.docs
    .filter(schedule => !isAlreadyChecked(schedule.data() as Schedule))
    .map(async schedule => {
      console.log('publish webChecker', (schedule.data() as Schedule).title);
      const data = JSON.stringify({ scheduleId: schedule.id });
      const dataBuffer = Buffer.from(data);
      await pubsub.topic('webChecker').publish(dataBuffer);
    });

  await Promise.all(publishPromises);
};

export default webFetcher;
