// routing.js - 認証状態に基づくルーティング
// 注意: このファイルは各ページで読み込まれますが、
// 詳細な認証チェックは各ページで個別に行います

(function() {
  'use strict';

  // ログインページ以外で未認証の場合はリダイレクト
  // ただし、各ページでより詳細なチェック（approved クレームなど）を行うため、
  // ここでは基本的なリダイレクトのみ
  const isLoginPage = location.pathname.endsWith('/login.html');
  const isLogoutPage = location.pathname.endsWith('/logout.html');

  // ログアウトページでは認証チェックをスキップ
  if (isLogoutPage) {
    return;
  }

  firebase.auth().onAuthStateChanged(user => {
    if (!user && !isLoginPage) {
      location.href = './login.html';
    } else if (user && isLoginPage) {
      location.href = './index.html';
    }
  });
})();
