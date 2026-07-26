/**
 * AuthGuard の状態遷移。
 *
 * 守りたいのは「未認証・承認待ちの状態で children を描いてしまわない」こと。
 * 描いてしまうと保護対象のコンポーネントが Firestore を叩き、
 * permission-denied が画面に露出する（現行 UI がまさにその状態だった）。
 *
 * 念のため: このガードはセキュリティ境界ではない。静的エクスポートなので
 * DevTools からバイパスできる。データを守っているのは firestore.rules。
 */

import { render, screen } from '@testing-library/react';

import { AuthGuard } from '@/components/auth/auth-guard';
import type { AuthContextValue, AuthStatus } from '@/lib/auth/auth-context';

const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const useAuthMock = jest.fn();
jest.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => useAuthMock() as AuthContextValue,
}));

function setStatus(status: AuthStatus) {
  useAuthMock.mockReturnValue({
    status,
    user: null,
    uid: null,
    email: 'someone@example.com',
    error: null,
    signIn: jest.fn(),
    signOut: jest.fn(),
    refreshClaims: jest.fn(),
    clearError: jest.fn(),
  });
}

const PROTECTED_TEXT = 'protected content';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AuthGuard', () => {
  it('hides children while the auth state is still resolving', () => {
    setStatus('loading');
    render(
      <AuthGuard>
        <p>{PROTECTED_TEXT}</p>
      </AuthGuard>,
    );

    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects to login and hides children when unauthenticated', () => {
    setStatus('unauthenticated');
    render(
      <AuthGuard>
        <p>{PROTECTED_TEXT}</p>
      </AuthGuard>,
    );

    // replace であること（push だと戻るボタンで往復する）。
    expect(replaceMock).toHaveBeenCalledWith('/login');
    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
  });

  it('shows the pending screen instead of children when the claim is missing', () => {
    setStatus('pending-approval');
    render(
      <AuthGuard>
        <p>{PROTECTED_TEXT}</p>
      </AuthGuard>,
    );

    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    expect(screen.getByText('アカウントの承認をお待ちください')).toBeInTheDocument();
    // 承認待ちはログイン画面へ飛ばさない。飛ばすとサインインし直す無限ループになる。
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders children only once approved', () => {
    setStatus('authorized');
    render(
      <AuthGuard>
        <p>{PROTECTED_TEXT}</p>
      </AuthGuard>,
    );

    expect(screen.getByText(PROTECTED_TEXT)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
