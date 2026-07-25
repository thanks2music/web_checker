import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp();
const auth = getAuth();

// 承認するユーザーの UID（コマンドライン引数で指定）
const uid = process.argv[2];

if (!uid) {
  console.error('使い方: node dist/scripts/setAdmin.js <UID>');
  console.error('例: node dist/scripts/setAdmin.js abc123def456');
  process.exit(1);
}

async function approveUser(uid: string): Promise<void> {
  try {
    // 1. ユーザーを有効化
    await auth.updateUser(uid, { disabled: false });
    console.log('ユーザーを有効化しました');

    // 2. approved カスタムクレームを設定
    await auth.setCustomUserClaims(uid, { approved: true });
    console.log('approved: true を設定しました');

    // 3. 確認
    const user = await auth.getUser(uid);
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

void approveUser(uid);
