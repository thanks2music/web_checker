# web_checker

[English version / 英語版 README はこちら](README.md)

Web ページの変更を監視して Slack に通知するアプリケーションです。

Firebase（Cloud Functions v2 + Firestore + Hosting）上に構築され、TypeScript で実装されています。

## 動作の仕組み

1. スケジュール関数（`webFetcher`）が **1 時間に 1 回**（毎時 5 分）起動します。
2. Firestore に登録された全スケジュールを読み込み、**各スケジュール自身の cron 式**を評価してチェック時期が来ているか判定します。
3. チェック対象のスケジュールは Pub/Sub トピックへ publish され、`webCrawler` が対象 URL を取得して CSS セレクタで指定された要素を抽出します。
4. 抽出した内容を前回のスナップショット（Firestore に保存）と比較し、変更があれば差分を Slack Incoming Webhook へ通知します。
5. スケジュールの作成・編集（`uri` / `selector` の変更）時は、即時チェックが実行されます（`webCrawlerOnWrite`）。

スケジューラ自体が毎時起動のため、1 時間より短い間隔をスケジュールに指定しても効果はありません。

### Cloud Functions 一覧

全関数が 2nd gen で、**Node.js 24** ランタイム上で動作します。

| 関数 | トリガー | メモリ | 役割 |
|---|---|---|---|
| `webFetcher` | スケジューラ（`5 * * * *`） | 256 MiB | チェック時期のスケジュールを判定し Pub/Sub へ publish |
| `webCrawler` | Pub/Sub（`webChecker` トピック） | 256 MiB | ページをクロールし、前回スナップショットと差分比較、履歴保存 |
| `webCrawlerOnWrite` | Firestore 書き込み（`schedules/{id}`） | 256 MiB | `uri` / `selector` 変更時に即時チェック |
| `slackNotifier` | Pub/Sub（`slackNotifier` トピック） | 256 MiB | Secret Manager から Webhook URL を読み、Slack へ送信 |
| `beforeCreate` | Auth ブロッキング（`beforeUserCreated`） | 256 MiB | 新規ユーザーを無効状態で作成し、管理者承認用に Slack 通知 |

> **メモリについて**: 全関数が単一の `index.ts` バンドルを共有するため、どの関数も起動時に依存パッケージ一式（`cheerio`, `axios`, `iconv-lite` など）をロードします。128 MiB では起動しきれず、readiness probe の前に OOM で強制終了されます。バンドルを関数ごとに分割しない限り 256 MiB を維持してください。

> **ランタイムについて**: `nodejs24` は **2nd gen 関数専用**で、**firebase-tools v15 以降**が必要です。v14 はデプロイ時に不正なランタイムとして拒否します。

## 必要要件

- **Node.js 24**（`.tool-versions` 参照。Cloud Functions のランタイムも `nodejs24` に固定）
- **pnpm 10**（本リポジトリは pnpm workspace）
- **firebase-tools v15 以降**（v14 では `nodejs24` ランタイムをデプロイ不可）
- Google アカウント
- Slack ワークスペース（Webhook URL 発行用）
- Java 21 以降（Firestore Rules テストをローカル実行する場合。エミュレータが要求）

## リポジトリ構成

```
.
├── firebase.json          # Firestore / Hosting / Functions 設定
├── .firebaserc            # プロジェクトエイリアス（default, debug）
├── firestore.rules        # セキュリティルール
├── pnpm-workspace.yaml    # workspace ルート（functions/ を対象）
├── functions/             # @revolution/web-checker-functions（Cloud Functions）
└── public/                # Firebase Hosting が配信する静的管理画面
```

## デプロイ方法

### 1. クローンと依存インストール

```shell
git clone <repository-url>
cd web_checker
pnpm install
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

> 1 つの請求先アカウントに紐付けられるプロジェクト数は既定で 5 件です。上限に達した場合は、未使用プロジェクトのリンクを解除するか、割り当て増加を申請してください。

### 3. Firebase CLI の認証

```shell
pnpm --filter @revolution/web-checker-functions exec firebase login
```

firebase-tools は workspace 内にバージョン固定で入っているため、グローバルの `firebase` ではなく pnpm 経由での実行を推奨します（グローバルが v14 の場合、`nodejs24` ランタイムのデプロイに失敗します）。

### 4. Firebase プロジェクトと作業ディレクトリの紐付け

```shell
pnpm --filter @revolution/web-checker-functions exec firebase use --add
```

- 先に作成した Firebase プロジェクトを選択
- エイリアス名を入力（例: `production`）

`.firebaserc` にエイリアスが記載されていることを確認してください。

### 5. Authentication を Identity Platform にアップグレード

`beforeCreate` ブロッキング関数の利用には **Identity Platform が必須**です。未対応のままだと、Auth への紐付け時に `Blocking Functions may only be configured for GCIP projects` エラーで失敗します。

1. Firebase コンソール → Authentication → 設定 → **ブロッキング関数**
2. 「Identity Platform へのアップグレード」の案内に従って実行

Identity Platform には Blaze プランで月間アクティブユーザー 5 万人の無料枠があります。**このアップグレードは元に戻せません。**

### 6. Google ログインの有効化

1. Firebase コンソール → 「Authentication」を選択
2. 「始める」をクリック
3. 「ログイン方法」タブ → 「Google」を選択
4. 「有効にする」をオン
5. 「プロジェクトのサポートメール」を設定
6. 「保存」をクリック

### 7. Firestore データベースの作成

1. Firebase コンソール → 「Firestore Database」を選択
2. 「データベースを作成」をクリック
3. 「本番環境モードで開始」を選択
4. ロケーションを選択（推奨: `us-central1`。Functions のリージョンと一致し、無料枠の範囲内）
5. 「有効にする」をクリック

### 8. Slack Webhook を Secret Manager に登録

#### 8.1 Slack Webhook URL の取得

1. [Slack API](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From scratch」を選択
3. アプリ名（例: `Web Checker`）とワークスペースを選択して作成
4. 左メニュー「Incoming Webhooks」をクリック
5. 「Activate Incoming Webhooks」をオンにする
6. ページ下部の「Add New Webhook to Workspace」をクリック
7. 通知先チャンネルを選択して「許可する」
8. 表示された Webhook URL をコピー

#### 8.2 Cloud Secret Manager へ登録

Webhook URL は秘匿情報のため、`.env` ファイルでは管理しません。`slackNotifier` が `defineSecret` で宣言し、Firebase が実行時にマウントします。

```shell
pnpm --filter @revolution/web-checker-functions exec \
  firebase functions:secrets:set SLACK_URL_REVOLUTION_WEB_CHECKER
```

プロンプトに URL を貼り付けてください。シェル履歴には残りません。初回実行時に CLI が Secret Manager API を有効化し、次回デプロイ時に実行サービスアカウントへ読み取り権限を付与します。

値をローテーションする場合は同じコマンドを再実行し（新しいバージョンが作成されます）、**`slackNotifier` を再デプロイ**してください。関数はデプロイ時点のシークレットバージョンにピン留めされるためです。

```shell
pnpm --filter @revolution/web-checker-functions exec \
  firebase deploy --only functions:slackNotifier
```

> **`functions/.env` に `SLACK_URL` や `HOSTING_URL` を書かないでください。** Firebase CLI は `.env` の全エントリを、デプロイした関数の**平文の環境変数としてアップロード**します。どちらの変数もコードからは既に参照されていません（Webhook は Secret Manager から、Hosting URL は `GCLOUD_PROJECT` から導出）。ローカル作業で必要になり得るキーは `.env.example` に記載しています。

### 9. デプロイ

```shell
pnpm --filter @revolution/web-checker-functions exec firebase deploy
```

`firebase.json` の predeploy で TypeScript のビルドが自動実行されるため、手動ビルドは不要です。

### 10. ブロッキング関数の紐付け

初回デプロイ完了後、認証フローに関数を組み込む必要があります。

1. Firebase コンソール → Authentication → 設定 → **ブロッキング関数**
2. **アカウント作成前（`beforeCreate`）** に `beforeCreate(us-central1)` を選択
3. 「ログイン前」は None のまま、「追加のプロバイダ トークン認証情報」は全てチェックなしのまま
4. 「保存」をクリック

保存するまでは新規ユーザーが**有効な状態で作成され**、承認フローがバイパスされます。

### 11. 最初のユーザーを承認

新規ユーザーは無効状態で作成され、管理者が承認するまでログインできません。承認処理では `disabled: false` と `approved: true` カスタムクレームの両方を設定します（後者は `firestore.rules` が要求します）。

1. Hosting URL（`https://<project-id>.web.app`）にアクセスし、Google でログインします。ログインは拒否されますが**これは想定通り**で、新規 UID を含む Slack 通知が届きます。
2. その UID を使って承認します。

```shell
gcloud auth application-default login   # 初回のみ
cd functions
pnpm run build
GOOGLE_CLOUD_PROJECT=<project-id> node dist/scripts/setAdmin.js <UID>
```

3. ログアウトして再ログインすると、スケジュール一覧画面が表示されます。

## 使い方

### スケジュールの登録

1. ログイン後、スケジュール一覧画面で以下を入力:
   - **スケジュール**: crontab 形式（例: `0 * * * *` = 1 時間に 1 回。これが既定値）。1 時間より短い間隔は効果がありません
   - **タイトル**: 任意の名前
   - **URL**: 監視対象の URL
   - **セレクタ**: CSS セレクタ（例: `#content`, `.main-text`）
   - **通知先**: Slack チャンネル名（省略可。Webhook のデフォルトを上書き）
2. 「新規追加」をクリック

初回のクロールは即座に実行され、「新規追加されました」という通知が届きます。2 回目以降は対象コンテンツに変更があった場合のみ通知されます。

## 開発

```shell
pnpm install       # workspace の依存をインストール
pnpm lint          # ESLint（flat config、型情報を使うルール込み）
pnpm type-check    # tsc --noEmit
pnpm test          # Jest ユニットテスト（ネットワークは nock でモック）
pnpm build         # tsc
```

### Firestore Rules テスト

Firestore エミュレータを使うため、PATH に JDK が必要です。

```shell
pnpm --filter @revolution/web-checker-functions test:rules
```

### ログの確認

```shell
pnpm --filter @revolution/web-checker-functions exec firebase functions:log
```

## 継続的インテグレーション

`.github/workflows/ci.yml` が `main` への push と pull request のたびに実行されます。内容は lint、type-check、ユニットテスト、Firestore Rules テスト（JDK 21 のエミュレータ）、build です。Node バージョンは `.tool-versions` から読み込むため、CI とローカル環境が乖離しません。

## ライセンス

MIT License
