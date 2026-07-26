'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { env } from '@/lib/env';

/**
 * Firebase クライアント SDK の初期化。
 *
 * Revolution の apps/ai-writer/lib/firebase/client.ts と同じ「モジュール読み込み時には
 * 初期化せず、最初に必要になった時点で生成してキャッシュする」形を採っている。
 * トップレベルで initializeApp を呼ぶと、import しただけのモジュール（テストや
 * 型のみの参照を含む）が設定不足で落ちるため。
 *
 * 設定値の欠落チェックは lib/env.ts の zod スキーマが担うので、ai-writer 版にある
 * 手書きの missing チェックは持ち込んでいない。検証箇所を一本化する意図。
 *
 * getStorage は export しない。本アプリは Cloud Storage を使わないため、
 * 使わないものを API 表面に出さない。
 */
let cachedApp: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;

  const existing = getApps();
  cachedApp =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
        });

  return cachedApp;
}

export const getFirebaseAuth = (): Auth => getAuth(getFirebaseApp());
export const getFirebaseDb = (): Firestore => getFirestore(getFirebaseApp());
