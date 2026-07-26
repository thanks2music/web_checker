/**
 * Firebase のエラーコードを画面の意図へ変換する。
 *
 * 純関数として切り出してあるのは、ここが本アプリで最もテストしやすく、
 * かつ間違えると体験が大きく劣化する箇所だから。現行の public/login.html は
 * `error.code + ': ' + error.message` を素で出しており、承認待ちのユーザーにも
 * `auth/user-disabled: The user account has been disabled by an administrator.`
 * という英文が出るだけだった。何をすればよいか分からない。
 *
 * @see functions/src/index.ts の beforeCreate（新規ユーザーを disabled で作る）
 */

/**
 * 画面がとるべき振る舞い。
 *
 * - `pending`: 承認待ち画面へ。ユーザーは何も間違っていないので赤いエラーにしない
 * - `silent`: 何も表示しない（ユーザー自身の操作によるキャンセル）
 * - `retryable`: メッセージ + 再試行導線
 * - `config`: 設定不備。運用者向けで、利用者には出しても意味がない
 * - `unknown`: 想定外。問い合わせ時に必要なのでコードも見せる
 */
export type AuthErrorKind = 'pending' | 'silent' | 'retryable' | 'config' | 'unknown';

export interface AuthErrorView {
  kind: AuthErrorKind;
  title: string;
  message: string;
  /** 再試行ボタンを出すか */
  retryable: boolean;
  /** 問い合わせ用に画面へ小さく添えるコード（unknown のときだけ入る） */
  code?: string;
}

/** Firebase の例外から `code` を取り出す。SDK の型に依存せず形で判定する。 */
function extractCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return null;
}

/**
 * サインイン中に取得できたメールアドレスを拾う。
 *
 * `auth/user-disabled` では User オブジェクトが手に入らないため、
 * 承認待ち画面に「どのアカウントで申請中か」を出すにはここから取るしかない。
 * これが無いと、管理者に承認を依頼する実務で詰む。
 */
export function extractAttemptedEmail(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'customData' in error) {
    const custom = (error as { customData?: { email?: unknown } }).customData;
    if (custom && typeof custom.email === 'string' && custom.email !== '') {
      return custom.email;
    }
  }
  return null;
}

/**
 * エラーを画面表示用に正規化する。表示不要なら null。
 *
 * `auth/user-disabled` が `pending` なのは、本アプリでは**それが新規ユーザーの
 * 主要導線**だから。beforeCreate が `{ disabled: true }` を返す設計上、初回サインインは
 * 必ずこれで失敗する。異常ではなく「承認待ちに入った」という正常系として扱う。
 */
export function mapAuthError(error: unknown): AuthErrorView | null {
  const code = extractCode(error);

  switch (code) {
    // --- 承認待ち（正常系） ---
    case 'auth/user-disabled':
      return {
        kind: 'pending',
        title: 'アカウントの承認をお待ちください',
        message:
          '管理者に登録の通知が送信されました。承認され次第ご利用いただけます。',
        retryable: false,
      };

    // --- ユーザー自身の操作。エラーとして出さない ---
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;

    // --- 再試行で解決しうる ---
    case 'auth/popup-blocked':
      return {
        kind: 'retryable',
        title: 'ポップアップがブロックされました',
        message:
          'ブラウザの設定でこのサイトのポップアップを許可してから、再試行してください。',
        retryable: true,
      };

    case 'auth/network-request-failed':
      return {
        kind: 'retryable',
        title: '通信エラー',
        message: 'ネットワークに接続できませんでした。再試行してください。',
        retryable: true,
      };

    case 'auth/too-many-requests':
      return {
        kind: 'retryable',
        title: '試行回数が上限に達しました',
        message: 'しばらく時間をおいてから再試行してください。',
        retryable: true,
      };

    // Firestore 側。approved claim がトークンに未反映か、承認が取り消されている。
    case 'permission-denied':
      return {
        kind: 'pending',
        title: 'データへのアクセス権がありません',
        message:
          'アカウントがまだ承認されていない可能性があります。承認状態を再確認してください。',
        retryable: false,
      };

    case 'unavailable':
      return {
        kind: 'retryable',
        title: 'データベースに接続できません',
        message: '一時的な問題の可能性があります。再試行してください。',
        retryable: true,
      };

    // --- 設定不備。利用者ではなく運用者が直すもの ---
    case 'auth/unauthorized-domain':
      return {
        kind: 'config',
        title: 'このドメインは許可されていません',
        message:
          'Firebase Authentication の「承認済みドメイン」にこのドメインを追加してください。',
        retryable: false,
      };

    case 'auth/operation-not-allowed':
      return {
        kind: 'config',
        title: 'Google ログインが有効になっていません',
        message:
          'Firebase コンソールの Authentication で Google プロバイダを有効にしてください。',
        retryable: false,
      };

    // blocking function が例外を投げた場合やタイムアウト（7 秒制約）もここに落ちる。
    default:
      return {
        kind: 'unknown',
        title: 'ログインに失敗しました',
        message: '時間をおいてから再試行してください。',
        retryable: true,
        code: code ?? undefined,
      };
  }
}
