# Firebase Authentication 問題分析レポート

**日付**: 2025-12-22
**問題**: Google認証後にユーザーがFirebase Authenticationに保存されない

---

## 1. 現象の整理

- Google認証ボタンをクリック → Google認証画面が表示される
- Google認証完了後、ページ遷移が発生しない
- Firebase Console の Authentication → Users に新規ユーザーが追加されない
- 「ログイン日」も記録されていない
- 手動でユーザーを追加することは可能

---

## 2. 現在の実装状況

### login.html の構成
```html
<script src="/__/firebase/10.12.0/firebase-app-compat.js"></script>
<script src="/__/firebase/10.12.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth__ja.js"></script>
<script src="/__/firebase/init.js?useEmulator=false"></script>
```

### FirebaseUI 設定
```javascript
const uiConfig = {
  signInSuccessUrl: '/index.html',
  signInOptions: [
    {
      provider: firebase.auth.GoogleAuthProvider.PROVIDER_ID,
      customParameters: {
        prompt: 'select_account'
      }
    }
  ],
  tosUrl: null,
  privacyPolicyUrl: null
};
const ui = new firebaseui.auth.AuthUI(firebase.auth());
ui.start('#firebaseui-auth-container', uiConfig);
```

---

## 3. 考えられる原因（可能性順）

### 3.1 User Self-Service 設定（最有力）

**ドキュメント参照**: `auth/02-users.md` - User self-service セクション

Firebase Authentication Settings で「ユーザーアクション」が制限されている可能性：

> By default, Firebase enables users to sign-up and delete their accounts without administrative intervention.
>
> In these cases, you can disable user actions from the Firebase Authentication Settings page, which prevents account creation and deletion by end-users.
>
> If an end-user attempts to create or delete an account within your system, the Firebase service will return an error code: `auth/admin-restricted-operation`

**確認方法**:
1. Firebase Console → Authentication → Settings
2. 「ユーザーアクション」セクションを確認
3. 「アカウントの作成」が無効になっていないか確認

### 3.2 FirebaseUI バージョン互換性

**現在の構成**:
- Firebase SDK: 10.12.0 (compat モード)
- FirebaseUI: 6.1.0

**潜在的問題**:
- FirebaseUI 6.x は Firebase 9.x 向けに設計
- compat モードでの10.x動作は未検証領域
- signInFailure コールバックがないためエラーが握りつぶされている可能性

### 3.3 signInWithRedirect の問題

FirebaseUIはデフォルトで `signInWithRedirect` を使用する可能性がある。
ドキュメントによると、redirect modeには特有の問題がある：

> Follow the best practices when using `signInWithRedirect`

redirect モードでは：
- 認証完了後のコールバック処理が複雑
- サードパーティCookie制限の影響を受けやすい
- ブラウザのポップアップブロックとは別の問題

### 3.4 Authorized domains 設定

Firebase Console → Authentication → Settings → Authorized domains に
以下のドメインが含まれているか確認：
- `debug-web-checker.web.app`
- `debug-web-checker.firebaseapp.com`
- `localhost` (開発用)

---

## 4. 推奨するデバッグアプローチ

### Step 1: エラーハンドリング強化版ログインページの作成

FirebaseUI の `signInFailure` コールバックを追加し、
エラーを明示的に表示する。

### Step 2: ブラウザ開発者ツールでの確認

ログインページでブラウザの開発者ツール（F12）を開き：
1. Console タブでエラーを確認
2. Network タブで失敗しているリクエストを確認
3. Application タブで Firebase の状態を確認

### Step 3: Firebase Console 設定の確認

1. Authentication → Settings → User actions
2. Authentication → Settings → Authorized domains
3. Authentication → Sign-in method → Google の設定

---

## 5. 次のアクション

1. **デバッグ強化版 login.html の作成・デプロイ**
2. **ブラウザでエラーを確認**
3. **Firebase Console の設定を確認**
4. **問題特定後、修正を実施**
