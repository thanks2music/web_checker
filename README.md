# web_checker

Web ページの変更を監視して Slack に通知するアプリケーションです。

## 必要要件

- Node.js 20 以上
- Firebase CLI
- Google アカウント
- Slack ワークスペース（Webhook URL 発行用）

## デプロイ方法

### 1. リポジトリのクローン

本リポジトリを任意のディレクトリに clone してください。

```shell
git clone <repository-url>
cd web-checker
```

以下の作業は、リポジトリのルートディレクトリ直下で行ってください。

### 2. Firebase プロジェクトの作成

1. [Firebase コンソール](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `web-checker-prod`）
4. Google アナリティクスは「今は設定しない」を選択
5. 「プロジェクトを作成」をクリック

#### 料金プランの変更

Cloud Functions を使用するため、Blaze（従量制）プランが必要です。

1. Firebase コンソールの左下「Spark アップグレード」をクリック
2. 「Blaze 従量制」を選択
3. 請求先アカウントを設定（なければ Google Cloud Platform から作成）

### 3. Firebase CLI の準備

Firebase CLI がインストールされていない場合は、以下のコマンドでインストールしてください。

```shell
npm install -g firebase-tools
```

参考: https://firebase.google.com/docs/cli?hl=ja

### 4. Firebase CLI の認証

以下のコマンドを実行して、Google 認証を済ませてください。

```shell
firebase login
```

### 5. Firebase プロジェクトと作業ディレクトリとの紐付け

以下のコマンドを実行して、プロジェクトに紐付けてください。

```shell
firebase use --add
```

- 先に作成した Firebase プロジェクトを選択
- エイリアス名を入力（例: `production`）

これにより、`.firebaserc` ファイルが生成されていることを確認してください。

### 6. Authentication の設定

1. Firebase コンソール → 「Authentication」を選択
2. 「始める」をクリック
3. 「ログイン方法」タブ → 「Google」を選択
4. 「有効にする」をオン
5. 「プロジェクトのサポートメール」を設定
6. 「保存」をクリック

### 7. Firestore の設定

1. Firebase コンソール → 「Firestore Database」を選択
2. 「データベースを作成」をクリック
3. 「本番環境モードで開始」を選択
4. ロケーションを選択（推奨: `asia-northeast1` = 東京）
5. 「有効にする」をクリック

### 8. 依存パッケージのインストール

```shell
cd functions
npm install
cd ..
```

### 9. Slack Webhook の設定

#### 9.1 Slack Webhook URL の取得

1. [Slack API](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From scratch」を選択
3. アプリ名（例: `Web Checker`）とワークスペースを選択して作成
4. 左メニュー「Incoming Webhooks」をクリック
5. 「Activate Incoming Webhooks」をオンにする
6. ページ下部の「Add New Webhook to Workspace」をクリック
7. 通知先チャンネルを選択して「許可する」
8. 表示された Webhook URL をコピー

#### 9.2 環境変数ファイルの作成

`functions/.env` ファイルを作成し、Webhook URL を設定します。

```shell
cd functions
touch .env
```

`functions/.env` の内容:

```env
SLACK_URL=https://hooks.slack.com/services/XXXXX/XXXXX/XXXXXXXXXXXXX
```

**注意**: `.env` ファイルは Git にコミットしないでください（`.gitignore` に追加済み）。

### 10. デプロイ

以下のコマンドを実行してデプロイを実行してください。

```shell
firebase deploy
```

デプロイ成功時の出力例:

```
=== Deploying to 'your-project-id'...

i  deploying firestore, functions, hosting
✔  firestore: rules file firestore.rules compiled successfully
✔  functions: all necessary APIs are enabled
✔  functions: ./functions folder uploaded successfully
✔  hosting: file upload complete
✔  firestore: released rules firestore.rules to cloud.firestore
✔  functions[webFetcher(us-central1)]: Successful create operation.
✔  functions[webCrawler(us-central1)]: Successful create operation.
✔  functions[slackNotifier(us-central1)]: Successful create operation.
✔  functions[sendWelcomeEmail(us-central1)]: Successful create operation.
✔  hosting: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/your-project-id/overview
Hosting URL: https://your-project-id.web.app
```

### 11. 管理者ユーザーの設定

本アプリでは、セキュリティのため `approved: true` のカスタムクレームを持つユーザーのみがアクセスできます。最初の管理者ユーザーには手動でカスタムクレームを設定する必要があります。

#### 11.1 アプリにログイン

1. デプロイ完了後、Hosting URL（`https://<project-id>.web.app`）にアクセス
2. Google アカウントでログイン
3. 「アカウントが承認されていません」と表示されることを確認

#### 11.2 ユーザー UID の確認

1. Firebase コンソール → 「Authentication」→「Users」タブ
2. ログインしたユーザーの「ユーザー UID」をコピー

#### 11.3 カスタムクレームの設定

`functions/` ディレクトリに `set-admin.js` を作成:

```javascript
const admin = require('firebase-admin');
admin.initializeApp();

const uid = 'ここにユーザーのUIDを貼り付け';

admin.auth().setCustomUserClaims(uid, { approved: true })
  .then(() => {
    console.log('カスタムクレームを設定しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('エラー:', error);
    process.exit(1);
  });
```

スクリプトを実行:

```shell
cd functions

# Google Cloud の認証（初回のみ）
gcloud auth application-default login

# スクリプトを実行
node set-admin.js

# 実行後、スクリプトを削除
rm set-admin.js
```

#### 11.4 再ログイン

カスタムクレーム設定後:

1. アプリからログアウト
2. 再度ログイン
3. スケジュール一覧画面が表示されれば成功

## 使い方

### スケジュールの登録

1. ログイン後、スケジュール一覧画面で以下を入力:
   - **スケジュール**: crontab 形式（例: `0 * * * *` = 毎時0分）
   - **タイトル**: 任意の名前
   - **URL**: 監視対象の URL
   - **セレクタ**: CSS セレクタ（例: `#content`, `.main-text`）
   - **通知先**: Slack チャンネル名（省略可）
2. 「新規追加」をクリック

### 動作の仕組み

1. 5分毎に Cloud Scheduler が起動
2. 登録されたスケジュールをチェック
3. URL にアクセスし、セレクタで指定された要素を取得
4. 前回の内容と比較し、変更があれば Slack に通知

## 開発

### ローカルでのテスト実行

```shell
cd functions
npm test
```

### 詳細なテスト出力

```shell
cd functions
npm run devtest
```

### Functions のログ確認

```shell
cd functions
npm run logs
```

## ライセンス

MIT License
