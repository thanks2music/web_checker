# web_checker

[English version / 英語版 README はこちら](README.md)

Web ページの変更を監視して Slack に通知するアプリケーションです。

Firebase（Cloud Functions v2 + Firestore + Hosting)上に構築され、TypeScript で実装されています。

## 動作の仕組み

1. スケジュール関数（`webFetcher`）が **1 時間に 1 回**（毎時 5 分）起動します。
2. Firestore に登録された全スケジュールを読み込み、各スケジュール自身の cron 式を評価してチェック時期が来ているか判定します。
3. チェック対象のスケジュールは Pub/Sub トピックへ publish され、`webCrawler` が対象 URL を取得して CSS セレクタで指定された要素を抽出します。
4. 抽出した内容を前回のスナップショット（Firestore に保存）と比較し、変更があれば差分を Slack Incoming Webhook へ通知します。
5. スケジュールの作成・編集（`uri` / `selector` の変更）時は、即時チェックが実行されます（`webCrawlerOnWrite`）。

### Cloud Functions 一覧

| 関数 | トリガー | 役割 |
|---|---|---|
| `webFetcher` | スケジューラ（`5 * * * *`） | チェック時期のスケジュールを判定し Pub/Sub へ publish |
| `webCrawler` | Pub/Sub（`webChecker` トピック） | ページをクロールし、前回スナップショットと差分比較、履歴保存 |
| `webCrawlerOnWrite` | Firestore 書き込み（`schedules/{id}`） | `uri` / `selector` 変更時に即時チェック |
| `slackNotifier` | Pub/Sub（`slackNotifier` トピック） | Slack Incoming Webhook へペイロード送信 |
| `sendWelcomeEmail` | Auth `onCreate`（v1） | 新規ユーザーを無効化し、管理者承認用に Slack 通知 |

## 必要要件

- Node.js 20 以上
- Firebase CLI
- Google アカウント
- Slack ワークスペース（Webhook URL 発行用）

## デプロイ方法

### 1. リポジトリのクローン

```shell
git clone <repository-url>
cd web_checker
```

以下の作業は、特に指定がない限りリポジトリのルートディレクトリ直下で行ってください。

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
4. ロケーションを選択（推奨: `us-central1`。Functions のリージョンと一致し、無料枠の範囲内）
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
✔  functions[webCrawlerOnWrite(us-central1)]: Successful create operation.
✔  functions[slackNotifier(us-central1)]: Successful create operation.
✔  functions[sendWelcomeEmail(us-central1)]: Successful create operation.
✔  hosting: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/your-project-id/overview
Hosting URL: https://your-project-id.web.app
```

### 11. ユーザーの有効化

本アプリでは、セキュリティのため新規ユーザーは自動的に無効化されます。管理者が Firebase コンソールから手動で有効化する必要があります。

#### 11.1 アプリにログイン

1. デプロイ完了後、Hosting URL（`https://<project-id>.web.app`）にアクセス
2. Google アカウントでログイン
3. 新規ユーザーの場合、ログインできない状態になります

#### 11.2 Slack 通知の確認

新規ユーザーがログインすると、設定した Slack チャンネルに通知が届きます。

#### 11.3 ユーザーの有効化

1. Firebase コンソール → 「Authentication」→「Users」タブ
2. 有効化したいユーザーの行をクリック
3. 「アカウントを無効にする」のチェックを外す
4. 「保存」をクリック

#### 11.4 再ログイン

ユーザー有効化後:

1. アプリからログアウト（または画面をリロード）
2. 再度ログイン
3. スケジュール一覧画面が表示されれば成功

## 使い方

### スケジュールの登録

1. ログイン後、スケジュール一覧画面で以下を入力:
   - **スケジュール**: crontab 形式（例: `0 * * * *` = 毎時 0 分）。ページのチェック頻度を制御します。全体のスケジューラが 1 時間に 1 回の起動のため、1 時間未満の間隔を指定しても効果はありません
   - **タイトル**: 任意の名前
   - **URL**: 監視対象の URL
   - **セレクタ**: CSS セレクタ（例: `#content`, `.main-text`）
   - **通知先**: Slack チャンネル名（省略可。Webhook のデフォルトを上書き）
2. 「新規追加」をクリック

## 開発

### TypeScript ビルド

本プロジェクトは TypeScript で実装されています。

```shell
cd functions
npm run build        # 一度ビルド
npm run build:watch  # 監視モードで自動ビルド
```

**注意**: `firebase deploy` 実行時は自動的にビルドが実行されるため、手動でのビルドは開発時のみ必要です。

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
