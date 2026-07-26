# TypeScript 移行前コードレビュー

**レビュー日:** 2025年12月17日
**対象:** web-checker リポジトリ全体
**目的:** TypeScript リファクタリング前の現状把握と問題点の洗い出し

---

## 概要

本リポジトリは約5年前に開発された Firebase ベースの Web ページ変更監視システムです。2025年12月現在の技術スタックに合わせて TypeScript へリファクタリングするにあたり、現状のコードをレビューしました。

**結論:** 現状のコードはデプロイ・動作しない可能性が非常に高い。Node.js 8 のサポート終了、依存ライブラリの非推奨化、Firebase SDK の古さが主な原因。

---

## 1. 致命的な問題（動作しない可能性が高い）

### 1.1 Node.js 8 はサポート終了済み

**ファイル:** `functions/package.json:15`

```json
"engines": {
  "node": "8"
}
```

**問題:** Firebase Functions は 2024年1月に Node.js 18 未満のサポートを終了。デプロイ自体が失敗する。

**対応:** Node.js 20 に更新が必要。

---

### 1.2 Firebase SDK のバージョンが古すぎる

**ファイル:** `functions/package.json:23-24`

```json
"firebase-admin": "^8.3.0",
"firebase-functions": "^3.1.0"
```

**問題:** 現在の最新は `firebase-admin` 12.x、`firebase-functions` 6.x。メジャーバージョンが4世代以上古く、多くのAPIが変更・非推奨化されている。

**対応:** 最新バージョンへのアップグレードと API 変更への対応が必要。

---

### 1.3 フロントエンドの Firebase SDK が古すぎる

**ファイル:** `public/index.html:59-62`

```html
<script src="/__/firebase/6.4.0/firebase-app.js"></script>
<script src="/__/firebase/6.4.0/firebase-auth.js"></script>
<script src="/__/firebase/6.4.0/firebase-firestore.js"></script>
```

**問題:** Firebase v9 以降は Modular SDK に完全移行。v6 は 2019年のもので、セキュリティパッチも提供されていない。

**対応:** Firebase v10+ (Modular SDK) への移行が必要。

---

### 1.4 `functions.config()` は非推奨

**ファイル:** `functions/index.js:8,11`

```javascript
const HOSTING_URL = functions.config().hosting_url || ...
const slack = new IncomingWebhook(functions.config().slack.url);
```

**問題:** Firebase Functions v2 では `functions.config()` は非推奨。

**対応:** `process.env` を使用した環境変数管理に変更。

---

### 1.5 `@slack/client` は非推奨

**ファイル:** `functions/package.json:18`

```json
"@slack/client": "^5.0.2"
```

**問題:** このパッケージは非推奨化されている。

**対応:** `@slack/webhook` パッケージへの移行。

---

### 1.6 `request` / `request-promise` は非推奨

**ファイル:** `functions/package.json:27-29`

```json
"promise-request-retry": "^1.0.1",
"request": "^2.88.0",
"request-promise": "^4.2.4"
```

**問題:** `request` は 2020年に完全に非推奨化。セキュリティアップデートも停止している。

**対応:** `axios` または `node-fetch` への移行。

---

## 2. セキュリティ上の重大な問題

### 2.1 SSL証明書検証の無効化（危険）

**ファイル:** `functions/lib/crawler.js:1`

```javascript
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
```

**問題:** 中間者攻撃（MITM）に対して完全に脆弱。本番環境で絶対にやってはいけない設定。

**リスク:**
- 通信内容の盗聴
- 通信内容の改ざん
- なりすまし攻撃

**対応:** この設定を削除し、自己署名証明書のサイトを監視する必要がある場合は、個別のサイトに対してのみ証明書を許可する方法を検討。

---

### 2.2 Firestore ルールが緩すぎる

**ファイル:** `firestore.rules:3-5`

```
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

**問題:** 認証さえしていれば、誰でも全データの読み書きが可能。

**リスク:**
- 他ユーザーのスケジュール削除・改ざん
- 機密データへのアクセス
- データの大量削除

**対応:** ユーザーごとのアクセス制御を実装。

```
match /schedules/{scheduleId} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.ownerId;
}
```

---

### 2.3 XSS 脆弱性

**ファイル:** `public/detail.html:46`

```javascript
<p class="card-text">${archive.data().content}</p>
```

**問題:** `content` にはクロール結果のHTMLがそのまま格納されている。悪意のあるサイトの `<script>` タグがそのまま実行される可能性がある。

**リスク:**
- セッションハイジャック
- 個人情報の窃取
- 不正操作の実行

**対応:** HTMLエスケープ処理の実装、または `textContent` を使用。

---

### 2.4 入力検証の欠如

**ファイル:** `public/detail.html:40`

```javascript
const scheduleId = location.search.match(/scheduleId=(.*)&*/)[1];
```

**問題:** URLパラメータを検証せずにFirestoreクエリに使用。

**リスク:**
- Null参照エラーによるアプリクラッシュ
- 不正なクエリの実行

**対応:** `URLSearchParams` を使用し、入力検証を追加。

---

## 3. バグ・コード品質の問題

### 3.1 `forEach` + `async` は期待通りに動作しない

**ファイル:** `functions/webFetcher.js:8`

```javascript
return await schedules.forEach(async schedule => {
```

**問題:** `forEach` は `async` コールバックの完了を待たない。全ての Pub/Sub publish が完了する前に関数が終了する可能性がある。

**対応:**
```javascript
await Promise.all(schedules.docs.map(async schedule => { ... }));
```

---

### 3.2 グローバル変数汚染

**ファイル:** `functions/lib/crawler.js:14`

```javascript
options = {
  retry: 3,
  uri: uri,
  ...
}
```

**問題:** `const` / `let` なしで宣言されているため、グローバル変数になっている。

**リスク:** 並行実行時に競合状態（Race Condition）が発生する可能性。

**対応:** `const options = { ... }` に修正。

---

### 3.3 HTMLタグの typo

**ファイル:** `public/detail.html:43`

```html
$('#records').append($(`<dev class="card">
```

**問題:** `<dev>` は `<div>` の typo。

**影響:** レイアウトが崩れる。

**対応:** `<div>` に修正。

---

### 3.4 テストが外部サービスに依存

**ファイル:** `functions/test/crawler.test.js:5`

```javascript
await expect(crawler('https://www.google.com/?hl=ja', 'title')).resolves.toBe('Google');
```

**問題:** 実際のHTTPリクエストを行うため、テストが不安定。

**リスク:**
- ネットワーク障害でテスト失敗
- 外部サイトの変更でテスト失敗
- CI/CD パイプラインの不安定化

**対応:** `nock` や `msw` を使用したHTTPモックの導入。

---

### 3.5 `var` の使用

**ファイル:** `functions/lib/slack_diff.js:9-10`, `functions/lib/crawler.js:35`

```javascript
var diffs;
var diffStr = '';
var result = [];
```

**問題:** `var` はスコープの問題を引き起こしやすい。

**対応:** `const` / `let` に統一。

---

## 4. 改善提案の優先順位

| 優先度 | 項目 | 理由 |
|--------|------|------|
| **必須** | Node.js 20 + 最新 Firebase SDK | 動作しないため |
| **必須** | `request` → `axios` or `node-fetch` | 非推奨ライブラリ |
| **必須** | SSL検証無効化の削除 | セキュリティリスク |
| **必須** | Firestore ルールの強化 | データ保護 |
| **高** | TypeScript 導入 | 型安全性、IDE支援 |
| **高** | フロントエンドの Firebase v10+ 移行 | セキュリティ、バンドルサイズ |
| **高** | XSS 対策（サニタイズ） | セキュリティ |
| **中** | `forEach` → `Promise.all` + `map` | 非同期処理の正確性 |
| **中** | テストのモック化 | テストの安定性 |
| **中** | 関心の分離（webCrawler.js の分割） | 保守性 |
| **低** | jQuery → Vanilla JS or Vue/React | モダン化 |

---

## 5. 推奨する対応順序

### Phase 1: 動作可能な状態への復旧（必須）

1. Node.js 20 への更新
2. Firebase SDK（バックエンド）の最新化
3. 非推奨ライブラリの置換（request → axios）
4. `functions.config()` → 環境変数への移行
5. `@slack/client` → `@slack/webhook` への移行

### Phase 2: セキュリティ修正

1. SSL証明書検証の有効化（または代替策の検討）
2. Firestore ルールの強化
3. XSS 対策の実装
4. 入力検証の追加

### Phase 3: TypeScript 移行

1. TypeScript 環境のセットアップ
2. 型定義の作成
3. 段階的な `.js` → `.ts` 変換
4. テストの TypeScript 化

### Phase 4: フロントエンド近代化

1. Firebase v10+ (Modular SDK) への移行
2. jQuery 依存の削除（任意）
3. ビルドツールの導入（Vite 等）

---

## 6. 参考リンク

- [Firebase Functions Node.js ランタイムサポート](https://firebase.google.com/docs/functions/manage-functions#set_nodejs_version)
- [Firebase Admin SDK 移行ガイド](https://firebase.google.com/docs/admin/migrate-node-v10)
- [Firebase Web SDK v9 移行ガイド](https://firebase.google.com/docs/web/modular-upgrade)
- [request パッケージ非推奨のお知らせ](https://github.com/request/request/issues/3142)
- [Slack Webhook SDK](https://slack.dev/node-slack-sdk/webhook)
