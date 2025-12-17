const slackNotifierLib = async (slack, message) => {
  console.log('send to slack', message);
  await slack.send(message);
};

module.exports = slackNotifierLib;
