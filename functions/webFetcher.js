const cronParser = require('cron-parser');

const webFetcher = async (firestore, pubsub) => {
  const schedules = await firestore.collection('schedules').get();

  const publishPromises = schedules.docs
    .filter(schedule => !isAlreadyChecked(schedule.data()))
    .map(async schedule => {
      console.log('publish webChecker', schedule.data().title);
      const data = JSON.stringify({ scheduleId: schedule.id });
      const dataBuffer = Buffer.from(data);
      await pubsub.topic('webChecker').publish(dataBuffer);
    });

  await Promise.all(publishPromises);
};

module.exports = webFetcher;

const isAlreadyChecked = (schedule) => {
  if (typeof schedule.checkedAt === 'undefined') { return false; }

  const prev = cronParser.parseExpression('* * * * *', {
    tz: 'Asia/Tokyo'
  }).prev().toDate();

  const checked = new Date(schedule.checkedAt);
  return prev < checked;
};
