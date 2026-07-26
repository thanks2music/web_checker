/**
 * 環境変数の型安全なスキーマ定義。
 *
 * Revolution monorepo では apps/frontend が @t3-oss/env-nextjs を採用しており、
 * 開発原則にも「使用継続」と明記されているため同じ形に揃えている。
 * @see revolution/apps/frontend/lib/env.ts
 *
 * 注意: output: 'export' のため、ここで定義した値はすべて **ビルド時にバンドルへ
 * 焼き込まれる**。実行時に差し替えることはできないので、環境ごとにビルドが必要。
 * NEXT_PUBLIC_FIREBASE_* が公開されること自体は Firebase の設計上の前提で問題ない
 * （apiKey は認証情報ではなくプロジェクト識別子）。アクセス制御は Firestore Rules が担う。
 */

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  },

  /*
   * クライアントサイド環境変数（NEXT_PUBLIC_ プレフィックス必須）。
   *
   * Firebase の 6 種はすべて必須にしている。1 つでも欠けると initializeApp が
   * 中途半端に成功して実行時まで問題が表面化しないため、ビルド時に落とす。
   */
  client: {
    NEXT_PUBLIC_FIREBASE_API_KEY: z
      .string()
      .min(1, { message: 'NEXT_PUBLIC_FIREBASE_API_KEY を設定してください' }),

    // 例: <project-id>.firebaseapp.com
    // signInWithPopup はこのドメイン配下の /__/auth/handler を使うため、
    // 値を誤ると Google ログインのポップアップが失敗する。
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z
      .string()
      .min(1, { message: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN を設定してください' }),

    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z
      .string()
      .min(1, { message: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID を設定してください' }),

    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z
      .string()
      .min(1, { message: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET を設定してください' }),

    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z
      .string()
      .min(1, { message: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID を設定してください' }),

    NEXT_PUBLIC_FIREBASE_APP_ID: z
      .string()
      .min(1, { message: 'NEXT_PUBLIC_FIREBASE_APP_ID を設定してください' }),
  },

  /*
   * ランタイム環境変数のマッピング。
   * destructuring はパフォーマンスのため推奨されないので全キーを明示列挙する。
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  },

  // 明示的な真値のみで skip する。`!!process.env.SKIP_ENV_VALIDATION` は文字列
  // "false" も truthy になり、意図せず検証を無効化する事故を招くため厳密一致で判定する。
  //
  // なお CI ではこれを使わず、ダミー値を渡してビルドしている。skip すると
  // runtimeEnv の書き漏れ（t3-env で最も多い事故）が CI で一度も検出されないため。
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === 'true' || process.env.SKIP_ENV_VALIDATION === '1',

  emptyStringAsUndefined: true,
});
