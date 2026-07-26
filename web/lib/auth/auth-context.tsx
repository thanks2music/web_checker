'use client';

import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getFirebaseAuth } from '@/lib/firebase/client';
import { extractAttemptedEmail, mapAuthError, type AuthErrorView } from '@/lib/auth/auth-error';

/**
 * 認証状態の保持と approved claim の判定。
 *
 * ## このアプリのセキュリティ境界は Firestore Rules だけである
 *
 * `output: 'export'` で静的配信するため middleware も API Route も存在しない。
 * Revolution の apps/ai-writer が持つ「AuthContext → /api/auth/set-token で
 * Admin SDK 検証 → httpOnly Cookie → middleware」という多層防御は構造的に作れない。
 *
 * したがって **AuthGuard も承認待ち画面もリダイレクトも、すべて UX のための飾り**であり、
 * DevTools からバイパスできる。バイパスされても firestore.rules が approved claim と
 * createdUser を検証するのでデータは守られる。
 *
 * この前提を崩さないこと。「middleware で守られている」と誤解して Rules を緩めると
 * 実際に穴が開く。SSR 化（Cloud Run / App Hosting）に変えても同じで、クライアントは
 * Firestore SDK を直接叩けるため Rules 以外に境界は作れない。
 * @see firestore.rules
 *
 * ## 責務は 3 つだけ
 *
 * (1) 認証状態の保持、(2) approved claim の判定、(3) エラーの UI 用正規化。
 * Firestore アクセスは持たない（Service 層の責務）。
 */

export type AuthStatus =
  /** onAuthStateChanged 未着、または claim 検証中 */
  | 'loading'
  /** 未ログイン */
  | 'unauthenticated'
  /** ログイン済みだが approved claim が無い */
  | 'pending-approval'
  /** approved claim あり。Firestore にアクセスしてよい */
  | 'authorized';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  uid: string | null;
  /** 承認待ち画面に出すメールアドレス。user が無い場合はサインイン失敗時の値 */
  email: string | null;
  error: AuthErrorView | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** ID トークンを強制更新して approved claim を再評価する。承認されていれば true */
  refreshClaims: () => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** custom claim が付いているか判定する。`true`（boolean）以外は未承認扱い。 */
function hasApprovedClaim(claims: Record<string, unknown>): boolean {
  // firestore.rules も `request.auth.token.approved == true` と厳密比較しているので、
  // 文字列 "true" や 1 を承認とみなさない点を揃える。
  return claims.approved === true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [attemptedEmail, setAttemptedEmail] = useState<string | null>(null);
  const [error, setError] = useState<AuthErrorView | null>(null);

  /**
   * 進行中の強制リフレッシュを共有する。
   *
   * 承認待ち画面のボタン連打や、複数箇所からの refreshClaims() 呼び出しで
   * securetoken エンドポイントを不必要に叩かないため。
   */
  const inflightRefresh = useRef<Promise<boolean> | null>(null);

  /**
   * approved claim を評価して status を決める。
   *
   * キャッシュ済みトークンで未承認だった場合に **1 回だけ**強制更新する。
   * 管理者が承認した直後に再ログインしたケースを救うため。
   * それでも駄目なら pending-approval で止め、自動リトライはしない
   * （securetoken にレートリミットがあり、承認待ちタブを開きっぱなしにされると
   * quota を食い潰すため。再確認はユーザー操作起点にする）。
   */
  const evaluate = useCallback(async (nextUser: User): Promise<void> => {
    try {
      const cached = await nextUser.getIdTokenResult();
      if (hasApprovedClaim(cached.claims)) {
        setStatus('authorized');
        return;
      }

      const fresh = await nextUser.getIdTokenResult(true);
      setStatus(hasApprovedClaim(fresh.claims) ? 'authorized' : 'pending-approval');
    } catch (caught) {
      // user-token-expired / user-disabled など。セッションを畳んで未認証に戻す。
      setError(mapAuthError(caught));
      await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    // onAuthStateChanged ではなく onIdTokenChanged を使う。トークンが自動更新
    // （既定で 1 時間ごと）されたタイミングでも claim を再評価したいため。
    // サインイン・サインアウトでも同様に発火するので上位互換になる。
    return onIdTokenChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setStatus('unauthenticated');
        return;
      }

      setAttemptedEmail(null);
      void evaluate(nextUser);
    });
  }, [evaluate]);

  const signIn = useCallback(async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    // 現行 FirebaseUI の customParameters と同じ。毎回アカウント選択を出す。
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      // signInWithRedirect ではなく popup。サードパーティ Cookie 制限で
      // redirect が機能しない問題があり、2025-12 に popup へ切り替えた経緯がある。
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (caught) {
      const view = mapAuthError(caught);
      setError(view);

      // user-disabled のときは User が手に入らないので、承認待ち画面に出す
      // メールアドレスを例外から拾っておく。
      if (view?.kind === 'pending') {
        setAttemptedEmail(extractAttemptedEmail(caught));
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    setAttemptedEmail(null);
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const refreshClaims = useCallback(async (): Promise<boolean> => {
    const current = getFirebaseAuth().currentUser;
    if (!current) return false;

    if (inflightRefresh.current) return inflightRefresh.current;

    const run = (async () => {
      try {
        const result = await current.getIdTokenResult(true);
        const approved = hasApprovedClaim(result.claims);
        setStatus(approved ? 'authorized' : 'pending-approval');
        return approved;
      } catch (caught) {
        setError(mapAuthError(caught));
        return false;
      } finally {
        inflightRefresh.current = null;
      }
    })();

    inflightRefresh.current = run;
    return run;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      uid: user?.uid ?? null,
      email: user?.email ?? attemptedEmail,
      error,
      signIn,
      signOut,
      refreshClaims,
      clearError,
    }),
    [status, user, attemptedEmail, error, signIn, signOut, refreshClaims, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth は AuthProvider の内側でのみ使用できます');
  }
  return context;
}
