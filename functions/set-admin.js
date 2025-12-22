const admin = require('firebase-admin');
admin.initializeApp();

// 承認するユーザーの UID（コマンドライン引数で指定）
const uid = process.argv[2];

if (!uid) {
  console.error('使い方: node set-admin.js <UID>');
  console.error('例: node set-admin.js abc123def456');
  process.exit(1);
}

async function approveUser(uid) {
  try {
    // 1. ユーザーを有効化
    await admin.auth().updateUser(uid, { disabled: false });
    console.log('ユーザーを有効化しました');

    // 2. approved カスタムクレームを設定
    await admin.auth().setCustomUserClaims(uid, { approved: true });
    console.log('approved: true を設定しました');

    // 3. 確認
    const user = await admin.auth().getUser(uid);
    console.log('UID:', uid);
    console.log('Email:', user.email);
    console.log('Disabled:', user.disabled);
    console.log('Custom Claims:', user.customClaims);

    process.exit(0);
  } catch (error) {
    console.error('エラー:', error);
    process.exit(1);
  }
}

approveUser(uid);
