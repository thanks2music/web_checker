/**
 * エラーコード → 画面意図のマッピング。
 *
 * 特に守りたいのは 2 点:
 *
 *   1. `auth/user-disabled` が「エラー」ではなく「承認待ち」に落ちること。
 *      beforeCreate が新規ユーザーを disabled で作る設計上、これは**正常系**であり、
 *      赤いエラーとして出すと初回利用者が全員「失敗した」と受け取る。
 *   2. ポップアップを自分で閉じただけのときに何も表示しないこと。
 *      現行 UI はここで英文のエラーコードを出しており、明らかにノイズだった。
 */

import { extractAttemptedEmail, mapAuthError } from '@/lib/auth/auth-error';

const firebaseError = (code: string, extra: Record<string, unknown> = {}) => ({
  name: 'FirebaseError',
  code,
  message: `mock ${code}`,
  ...extra,
});

describe('mapAuthError', () => {
  it('routes a disabled account to the pending-approval flow, not an error', () => {
    const view = mapAuthError(firebaseError('auth/user-disabled'));

    expect(view?.kind).toBe('pending');
    expect(view?.retryable).toBe(false);
  });

  it.each([['auth/popup-closed-by-user'], ['auth/cancelled-popup-request']])(
    'shows nothing for %s (the user cancelled deliberately)',
    (code) => {
      expect(mapAuthError(firebaseError(code))).toBeNull();
    },
  );

  it.each([
    ['auth/popup-blocked'],
    ['auth/network-request-failed'],
    ['auth/too-many-requests'],
    ['unavailable'],
  ])('offers a retry for %s', (code) => {
    const view = mapAuthError(firebaseError(code));

    expect(view?.kind).toBe('retryable');
    expect(view?.retryable).toBe(true);
  });

  it('treats a Firestore permission-denied as a claim problem', () => {
    // approved claim がトークンに未反映か、承認が取り消されたケース。
    const view = mapAuthError(firebaseError('permission-denied'));

    expect(view?.kind).toBe('pending');
  });

  it.each([['auth/unauthorized-domain'], ['auth/operation-not-allowed']])(
    'flags %s as an operator configuration problem',
    (code) => {
      expect(mapAuthError(firebaseError(code))?.kind).toBe('config');
    },
  );

  it('surfaces the code for unrecognised errors so support can act on it', () => {
    // blocking function の例外や 7 秒タイムアウトもここに落ちる。
    const view = mapAuthError(firebaseError('auth/internal-error'));

    expect(view?.kind).toBe('unknown');
    expect(view?.code).toBe('auth/internal-error');
  });

  it('handles values that are not Firebase errors at all', () => {
    expect(mapAuthError(new Error('boom'))?.kind).toBe('unknown');
    expect(mapAuthError(undefined)?.kind).toBe('unknown');
  });

  it('never leaks a raw code into the user-facing message', () => {
    // 現行 UI は `error.code + ': ' + error.message` を素で出していた。
    const view = mapAuthError(firebaseError('auth/user-disabled'));

    expect(view?.message).not.toContain('auth/');
  });
});

describe('extractAttemptedEmail', () => {
  it('recovers the email from a failed sign-in', () => {
    // user-disabled では User が取れないため、承認待ち画面に出す
    // 「どのアカウントで申請中か」はここからしか得られない。
    const error = firebaseError('auth/user-disabled', {
      customData: { email: 'someone@example.com' },
    });

    expect(extractAttemptedEmail(error)).toBe('someone@example.com');
  });

  it('returns null when there is no email to recover', () => {
    expect(extractAttemptedEmail(firebaseError('auth/user-disabled'))).toBeNull();
    expect(extractAttemptedEmail(new Error('boom'))).toBeNull();
  });
});
