const userAuth = async (auth, pubsub, user) => {
  console.log('registered new user: ', user.email);

  // beforeUserCreated では customClaims を設定してアクセス制御
  // 管理者が approved: true を設定するまでアクセスを制限

  const slackPayload = {
    text: `[WEB CHECKER] ユーザが新規登録されました`,
    attachments: [{
      title: "有効なユーザの場合、Firebase コンソールからカスタムクレームを設定してください",
      title_link: "https://console.firebase.google.com",
      fields: [
        { title: "email", value: user.email || '(不明)' },
        { title: "name", value: user.displayName || '(不明)' }
      ]
    }]
  };
  const data = JSON.stringify(slackPayload);
  const dataBuffer = Buffer.from(data);
  await pubsub.topic('slackNotifier').publish(dataBuffer);

  // beforeUserCreated のレスポンスとしてカスタムクレームを返す
  return {
    customClaims: {
      approved: false
    }
  };
};

module.exports = userAuth;
