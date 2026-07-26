# web_checker

[English version / 英語版 README はこちら](README.md)

Web ページの変更を監視して Slack に通知するアプリケーションです。

Firebase（Cloud Functions v2 + Firestore + Hosting）上に構築され、管理画面は Next.js、全体を TypeScript で実装しています。

## 動作の仕組み

1. スケジュール関数（`webFetcher`）が **1 時間に 1 回**（毎時 5 分）起動します。
2. Firestore に登録された全スケジュールを読み込み、**各スケジュール自身の cron 式**を評価してチェック時期が来ているか判定します。
3. チェック対象のスケジュールは Pub/Sub トピックへ publish され、`webCrawler` が対象 URL を取得して CSS セレクタで指定された要素を抽出します。
4. 抽出した内容を前回のスナップショット（Firestore に保存）と比較し、変更があれば差分を Slack Incoming Webhook へ通知します。
5. スケジュールの作成・編集（`uri` / `selector` の変更）時は、即時チェックが実行されます（`webCrawlerOnWrite`）。

スケジューラ自体が毎時起動のため、**1 時間より短い間隔をスケジュールに指定しても効果はありません**。`*/10 * * * *` と設定しても実際は 1 時間に 1 回です。管理画面が生の cron 入力ではなくプリセット選択を主にしているのはこのためです。

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

## リポジトリ構成

2 パッケージ構成の pnpm workspace です。

```
.
├── firebase.json          # Firestore / Hosting / Functions 設定
├── .firebaserc            # プロジェクトエイリアス（default, debug）
├── firestore.rules        # セキュリティルール — 実質的なアクセス境界
├── pnpm-workspace.yaml
├── functions/             # @revolution/web-checker-functions（Cloud Functions）
└── web/                   # @revolution/web-checker-web（Next.js 管理画面）
    ├── app/               # App Router。(protected) は承認済みアカウントが必要
    ├── components/
    ├── lib/               # firebase クライアント、認証、Service、スキーマ
    └── __tests__/
```

管理画面は **静的エクスポート**（`output: 'export'`）で、Firebase Hosting が配信します。つまり middleware も API Route も存在せず、そこから直接導かれる帰結があります。

> **`firestore.rules` だけが実質的なセキュリティ境界です。** 認証ガード・承認待ち画面・リダイレクトはすべてクライアントサイドで、DevTools からバイパスできます。データを守っているのは、`approved` カスタムクレームを要求し、書き込み時に所有者を検証する Rules です。サーバーレンダリングに変えてもこれは変わりません（ブラウザは常に Firestore と直接やり取りできるため）。

## 必要要件

- **Node.js 24**（`.tool-versions` 参照。Cloud Functions のランタイムも `nodejs24` に固定）
- **pnpm 10**
- **firebase-tools v15 以降**（v14 では `nodejs24` ランタイムをデプロイ不可）。workspace 内にバージョン固定で入っているので、グローバル版ではなく pnpm 経由での実行を推奨します
- Google アカウント
- Slack ワークスペース（Webhook URL 発行用）
- Java 21 以降（Firestore Rules テストをローカル実行する場合。エミュレータが要求）

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
3. プロジェクト名を入力
4. Google アナリティクスは「今は設定しない」を選択
5. 「プロジェクトを作成」をクリック

Cloud Functions を使用するため **Blaze（従量制）プラン**が必要です。コンソール左下からアップグレードし、請求先アカウントを紐付けてください。

> 1 つの請求先アカウントに紐付けられるプロジェクト数は既定で 5 件です。上限に達した場合は、未使用プロジェクトのリンクを解除するか、割り当て増加を申請してください。

### 3. 認証とプロジェクトの紐付け

```shell
pnpm --filter @revolution/web-checker-functions exec firebase login
pnpm --filter @revolution/web-checker-functions exec firebase use --add
```

プロジェクトを選択してエイリアス名を入力します。`.firebaserc` に記載されたことを確認してください。

### 4. Authentication を Identity Platform にアップグレード

`beforeCreate` ブロッキング関数の利用には **Identity Platform が必須**です。未対応のままだと、Auth への紐付け時に `Blocking Functions may only be configured for GCIP projects` エラーで失敗します。

Firebase コンソール → Authentication → 設定 → **ブロッキング関数** から案内に従ってアップグレードします。Identity Platform には Blaze プランで月間アクティブユーザー 5 万人の無料枠があります。**このアップグレードは元に戻せません。**

### 5. Google ログインの有効化

Firebase コンソール → Authentication →「ログイン方法」→ Google を有効化し、サポートメールを設定して保存します。

### 6. Firestore データベースの作成

Firebase コンソール → Firestore Database →「データベースを作成」→ 本番環境モード → ロケーション `us-central1`（Functions のリージョンと一致し、無料枠の範囲内）。

### 7. Web アプリの登録と管理画面の設定

管理画面は Hosting の `/__/firebase/init.js` ではなく環境変数から Firebase 設定を読むため、Web アプリの登録が必要です。

```shell
pnpm --filter @revolution/web-checker-functions exec firebase apps:create WEB "Web Checker Admin"
pnpm --filter @revolution/web-checker-functions exec firebase apps:sdkconfig WEB <APP_ID>
```

出力された値を `web/.env.example` をテンプレートとして `web/.env.local`（git 管理外）へ書き込みます。6 つのキーはすべて必須で、1 つでも欠けるとビルドが失敗します。

> これらの値はビルド時に JavaScript バンドルへ埋め込まれます。これは想定通りで、Firebase の `apiKey` は認証情報ではなくプロジェクト識別子です。アクセス制御は `firestore.rules` が担います。

### 8. Slack Webhook を Secret Manager に登録

[api.slack.com/apps](https://api.slack.com/apps) で Incoming Webhook を作成し（Create New App → From scratch → Incoming Webhooks → Add New Webhook to Workspace）、以下を実行します。

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

> **`functions/.env` に `SLACK_URL` や `HOSTING_URL` を書かないでください。** Firebase CLI は `.env` の全エントリを、デプロイした関数の**平文の環境変数としてアップロード**します。どちらの変数もコードからは既に参照されていません（Webhook は Secret Manager から、Hosting URL は `GCLOUD_PROJECT` から導出）。

### 9. デプロイ

```shell
pnpm --filter @revolution/web-checker-functions exec firebase deploy
```

`firebase.json` の predeploy で両パッケージのビルドが自動実行されるため、手動ビルドは不要です。

UI を変更した場合は、本番に反映する前にプレビューで確認する価値があります。

```shell
pnpm --filter @revolution/web-checker-functions exec \
  firebase hosting:channel:deploy preview --expires 7d
```

プレビューチャネルは**本番と同じ Firestore / Auth** に対して新しいビルドを配信し、その間も本番は現行版を配信し続けます。

### 10. ブロッキング関数の紐付け

初回デプロイ完了後:

1. Firebase コンソール → Authentication → 設定 → **ブロッキング関数**
2. **アカウント作成前（`beforeCreate`）** に `beforeCreate(us-central1)` を選択
3. 「ログイン前」は None のまま、プロバイダトークンのチェックは全て外したまま
4. 保存

保存するまでは新規ユーザーが**有効な状態で作成され**、承認フローがバイパスされます。

### 11. 最初のユーザーを承認

新規ユーザーは無効状態で作成され、管理者が承認するまでログインできません。承認処理では `disabled: false` と `approved: true` カスタムクレームの両方を設定します（後者は `firestore.rules` が要求します）。

1. Hosting URL にアクセスし、Google でログインします。ログインは拒否されますが**これは想定通り**で、新規 UID を含む Slack 通知が届きます。
2. その UID を使って承認します。

```shell
gcloud auth application-default login   # 初回のみ
cd functions
pnpm run build
GOOGLE_CLOUD_PROJECT=<project-id> node dist/scripts/setAdmin.js <UID>
```

3. アプリに戻り、承認待ち画面の「承認状態を再確認」を押すか、ログアウトして再ログインします。

> カスタムクレームは発行済みの ID トークンには届かず、最大 1 時間後の更新まで反映されません。承認待ち画面のボタンが強制更新をかけるので、それが最短です。

## 使い方

### スケジュールの登録

ログイン後、「スケジュールを追加」から:

- **タイトル** — 任意の名前
- **監視する URL** — `https://` 限定
- **CSS セレクタ** — 監視したい要素（例: `#content`, `.main-text`）
- **Slack 通知先** — チャンネル名。空欄なら Webhook の既定チャンネル
- **実行頻度** — プリセット、またはカスタム cron 式。次回いつチェックが走るかがフォームに表示されます

初回のクロールは即座に実行され、「新規追加されました」という通知が届きます。2 回目以降は対象コンテンツに変更があった場合のみ通知されます。

URL やセレクタを編集した場合も即座に再クロールが走ります。保存前にフォームがその旨を表示します。

編集・削除できるのは自分が作成したスケジュールのみです。Rules が所有者を検証し、UI もそれに合わせてボタンを出し分けます。

## 開発

```shell
pnpm install       # workspace の依存をインストール
pnpm lint          # 両パッケージに ESLint
pnpm type-check
pnpm test          # Jest（両パッケージ）
pnpm build
pnpm dev:web       # Next.js 開発サーバ http://localhost:6060
```

> ポートは 6666 ではなく 6060 です。6666 はブラウザが ircu 用に予約しており、Next.js が起動を拒否します。

### Firestore Rules テスト

Firestore エミュレータを使うため、PATH に JDK が必要です。

```shell
pnpm --filter @revolution/web-checker-functions test:rules
```

### ログの確認

```shell
pnpm --filter @revolution/web-checker-functions exec firebase functions:log
```

## Hosting の挙動で知っておくべきこと

Firebase Hosting について、ローカルビルドからは分からないことが 2 つあります。どちらもプレビューチャネルへデプロイして初めて判明したものです。

**拡張子なしパスは自動では解決されません。** 静的エクスポートは `out/detail.html` を出力し、Hosting は `/detail.html` に対してこれを配信します（これが過去の Slack 通知のリンクを生かしている仕組みです）。しかし `/detail` は rewrite がなければ 404 になり、`next/link` が指しているのはこちらです。`firebase.json` が各ルートに rewrite を宣言しているのはこのためです。

**ヘッダーのルールはリクエストパスにマッチし、解決後のファイルには適用されません。** `**/*.@(html)` というルールは `/index.html` には効きますが `/` には効きません。そのため拡張子なしパスを明示的に列挙して HTML を `no-cache` で配信しています。これがないと、デプロイで既に削除されたコンテンツハッシュ付きチャンクを参照する古いドキュメントを、ブラウザが保持し続けることがあります。

系として、`web/next.config.ts` の `trailingSlash` は `false` のまま維持する必要があります。`true` にすると出力が `out/detail/index.html` に変わり、過去の Slack リンクが一斉に壊れます。CI がフラットなファイル名をアサートしているのはこの理由です。

## 継続的インテグレーション

`.github/workflows/ci.yml` が `main` への push と pull request のたびに実行されます。内容は lint、type-check、ユニットテスト、Firestore Rules テスト（JDK 21 のエミュレータ）、build、および静的エクスポートが期待するフラットな HTML ファイルを出力し続けているかのアサーションです。Node バージョンは `.tool-versions` から読み込むため、CI とローカル環境が乖離しません。

## ライセンス

MIT License
