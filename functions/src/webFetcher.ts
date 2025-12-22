import cronParser from 'cron-parser';
import { Firestore } from 'firebase-admin/firestore';
import { PubSub } from '@google-cloud/pubsub';
import { Schedule } from './types';

/**
 * スケジュールがすでにチェック済みかどうかを判定
 * @param schedule スケジュールデータ
 * @returns チェック済みの場合 true
 */
const isAlreadyChecked = (schedule: Schedule): boolean => {
  if (typeof schedule.checkedAt === 'undefined') {
    return false;
  }

  const prev = cronParser.parseExpression('* * * * *', {
    tz: 'Asia/Tokyo'
  }).prev().toDate();

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
