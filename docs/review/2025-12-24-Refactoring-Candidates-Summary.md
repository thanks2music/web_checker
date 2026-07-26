# リファクタリング候補サマリー

**レビュー日:** 2025-12-24
**レビュアー:** Claude Code
**対象:** WEB CHECKER アプリケーション全体
**コードベース年齢:** 5-6年（2019年頃作成）

---

## エグゼクティブサマリー

Firebase ベースの Web 監視システムを、2025年12月時点のベストプラクティスに照らしてレビューした。TypeScript 移行は完了しているが、セキュリティ、パフォーマンス、保守性において改善が必要な箇所が複数存在する。

### リスク評価

| カテゴリ | リスク | 概要 |
|---------|--------|------|
| セキュリティ | **高** | Firestore Rules の権限不備、SSRF リスク |
| パフォーマンス | 中 | 全件取得クエリ、ページネーション未実装 |
| 保守性 | 中 | テストカバレッジ不足、レガシー依存関係 |
| アクセシビリティ | 低 | ARIA 属性不足（ただし内部ツールのため影響限定的） |

---

## P0: 緊急対応（セキュリティ・データ整合性に直結）

### 1. Firestore Rules の権限不備

**ファイル:** `firestore.rules`

**現状の問題:**
```javascript
allow update: if isAuthenticated();
allow delete: if isAuthenticated();
```

**リスク:**
- 認証済みユーザーなら誰でも、他人のスケジュールを更新・削除可能
- `createdUser`, `createdAt` フィールドの改ざんが可能
- `approved` カスタムクレームの検証が未実装（`userAuth.ts` で言及されているが未使用）

**推奨修正:**
```javascript
allow update: if isAuthenticated()
  && isApproved()
  && request.resource.data.createdUser == resource.data.createdUser
  && request.resource.data.createdAt == resource.data.createdAt
  && request.resource.data.uri is string
  && request.resource.data.uri.matches('^https?://.*')
  && request.resource.data.selector is string
  && request.resource.data.selector.size() < 500;

allow delete: if isAuthenticated()
  && isApproved()
  && resource.data.createdUser == request.auth.token.email;

function isApproved() {
  return request.auth.token.approved == true;
}
```

---

### 2. webFetcher の全件取得問題

**ファイル:** `functions/src/webFetcher.ts` (16-41行目)

**現状の問題:**
```typescript
const schedules = await firestore.collection('schedules').get();
const publishPromises = schedules.docs
  .filter(schedule => !isAlreadyChecked(schedule.data() as Schedule))
```

**リスク:**
- 全スケジュールを取得してからメモリ内でフィルタリング
- スケジュール数が増加すると Firestore 読み取りコストが増大
- メモリ使用量が予測不能

**推奨修正:**
```typescript
const previousMinute = cronParser.parseExpression('* * * * *', {
  tz: 'Asia/Tokyo'
}).prev().toDate();

const schedules = await firestore
  .collection('schedules')
  .where('checkedAt', '<', +previousMinute)
  .get();
```

**備考:** この修正には Firestore インデックスの追加が必要。

---

### 3. SSRF（Server-Side Request Forgery）対策

**ファイル:** `functions/src/lib/crawler.ts` (35-42行目)

**現状の問題:**
```typescript
const response = await axios.get<Buffer>(uri, {
  responseType: 'arraybuffer',
```

**リスク:**
- プライベート IP (127.0.0.1, 10.x.x.x, 192.168.x.x) へのリクエストが可能
- クラウドメタデータエンドポイント (169.254.169.254) へのアクセスが可能
- `file://`, `ftp://` などの非 HTTP プロトコルへのアクセスが可能

**推奨修正:**
```typescript
import { URL } from 'url';
import dns from 'dns/promises';

const validateUrl = async (uri: string): Promise<void> => {
  const url = new URL(uri);

  // プロトコルチェック
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP/HTTPS protocols are allowed');
  }

  // DNS 解決してプライベート IP をブロック
  const addresses = await dns.resolve4(url.hostname);
  const privateRanges = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./,
  ];

  for (const addr of addresses) {
    if (privateRanges.some(range => range.test(addr))) {
      throw new Error('Private IP addresses are not allowed');
    }
  }
};
```

---

### 4. Firebase Functions v1 から v2 への移行

**ファイル:** `functions/src/index.ts` (98-106行目)

**現状の問題:**
```typescript
export const sendWelcomeEmail = functionsV1
  .region(REGION)
  .runWith({ timeoutSeconds: 300, memory: '128MB' })
  .auth.user()
  .onCreate(async (user) => {
```

**リスク:**
- Firebase Functions v1 は非推奨
- v1/v2 混在によるメンテナンス複雑化

**推奨修正:**
```typescript
import { beforeUserCreated } from 'firebase-functions/v2/identity';

export const sendWelcomeEmail = beforeUserCreated({
  region: REGION,
  timeoutSeconds: 300,
  memory: '128MiB',
}, async (event) => {
  await authUserLib(auth, pubsub, event.data);
});
```

**備考:** v2 の Identity トリガーは `beforeUserCreated` / `beforeUserSignedIn` で、`onCreate` とは動作が異なる。移行前に挙動の確認が必要。

---

## P1: 高優先度（パフォーマンス・セキュリティ改善）

### 5. フロントエンドのページネーション未実装

**ファイル:** `public/index.html` (89行目), `public/detail.html` (79行目)

**現状の問題:**
```javascript
// index.html
db.collection('schedules').orderBy('createdAt', 'desc').get()

// detail.html
db.collection('schedules').doc(scheduleId).collection('archives').orderBy('time', 'desc').get()
```

**リスク:**
- スケジュール/アーカイブが増加するとページ読み込みが遅延
- ブラウザメモリを大量消費
- Firestore 読み取りコストが増大

**推奨修正:**
```javascript
// ページネーション実装例
const PAGE_SIZE = 50;
let lastDoc = null;

async function loadSchedules(startAfterDoc = null) {
  let query = db.collection('schedules')
    .orderBy('createdAt', 'desc')
    .limit(PAGE_SIZE);

  if (startAfterDoc) {
    query = query.startAfter(startAfterDoc);
  }

  const snapshot = await query.get();
  lastDoc = snapshot.docs[snapshot.docs.length - 1];
  // ... render
}
```

---

### 6. Bootstrap 4 から 5 へのアップグレード

**ファイル:** `public/index.html`, `public/detail.html`

**現状の問題:**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
```

**リスク:**
- Bootstrap 4 は EOL（End of Life）
- 既知の XSS 脆弱性（CVE-2024-6484 等）が存在（ただし tooltip/popover 使用時のみ）

**推奨修正:**
```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
```

**備考:** Bootstrap 5 は jQuery 非依存。jQuery 削除と同時に行うと効率的。

---

### 7. Firebase SDK のアップグレード

**ファイル:** `public/*.html`

**現状の問題:**
```html
<script src="/__/firebase/10.12.0/firebase-app-compat.js"></script>
```

**リスク:**
- バージョン 10.12.0 は 2024年6月リリース
- compat API は旧 v8 互換レイヤー（非推奨）

**推奨修正（短期）:**
```html
<script src="/__/firebase/11.1.0/firebase-app-compat.js"></script>
```

**推奨修正（長期）:** Modular SDK への移行
```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
```

---

### 8. エラーハンドリングの強化

**ファイル:** `functions/src/webCrawler.ts` (148-156行目)

**現状の問題:**
```typescript
if (text === null) {
  const jstHour = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false });
  if (parseInt(jstHour) === 1) {
    // 1時のみ通知
  }
  throw new Error(`NoContent: ${schedule.title}`);
}
```

**リスク:**
- 23時間/日はエラーが握りつぶされる
- デバッグが困難
- エラー傾向の把握ができない

**推奨修正:**
```typescript
// エラーカウンターを Firestore に保存
const errorCountRef = firestore.doc(`schedules/${scheduleId}/meta/errors`);
const errorDoc = await errorCountRef.get();
const errorCount = (errorDoc.data()?.noContentCount || 0) + 1;

await errorCountRef.set({ noContentCount: errorCount, lastError: new Date() }, { merge: true });

// 連続 N 回失敗で通知
if (errorCount % 24 === 0) {
  await pubsub.topic('slackNotifier').publish(slackNoContentErrorFormat(schedule, hostingUrl));
}
```

---

## P2: 中優先度（保守性・コード品質）

### 9. テストカバレッジの向上

**現状:**
- テストファイル: 2個（`crawler.test.ts`, `slackDiff.test.ts`）
- 推定カバレッジ: 約5%
- 未テストモジュール: `webFetcher.ts`, `webCrawler.ts`, `slackNotifier.ts`, `userAuth.ts`

**リスク:**
- リファクタリング時のデグレード検出が困難
- 外部 API (google.com) への依存テストが不安定

**推奨対応:**
1. `nock` または `msw` による HTTP モック導入
2. 主要関数の単体テスト追加
3. カバレッジ閾値設定（目標: 60%）

**テスト追加優先順:**
1. `webCrawler.ts` - ビジネスロジックの中核
2. `webFetcher.ts` - スケジューリングロジック
3. `slackNotifier.ts` - 通知フォーマット

---

### 10. 依存関係の更新

**ファイル:** `functions/package.json`

| パッケージ | 現在 | 推奨 | 理由 |
|-----------|------|------|------|
| `jschardet` | 3.1.4 | `chardet` へ移行 | メンテナンス停滞 |
| `firebase-functions` | 6.3.0 | 最新版 | 警告メッセージ対応 |

**追加推奨:**
- `eslint` + `@typescript-eslint/*` - リンター導入
- `prettier` - フォーマッター導入

---

### 11. 重複コードの抽出

**ファイル:** `functions/src/webCrawler.ts` (184-194行目)

**現状の問題:**
```typescript
const newContent = cheerio
  .load(text.replace(/<\/(.*?)>/g, '</$1>\n').replace(/<br\s*\/?>/g, '<br>\n'))
  .text()
  .replace(/[\t| |　]+/g, ' ')
  .replace(/\s+\n/g, '\n');

const oldContent = cheerio
  .load(content.replace(/<\/(.*?)>/g, '</$1>\n').replace(/<br\s*\/?>/g, '<br>\n'))
  .text()
  .replace(/[\t| |　]+/g, ' ')
  .replace(/\s+\n/g, '\n');
```

**推奨修正:**
```typescript
const normalizeHtml = (html: string): string => {
  return cheerio
    .load(html.replace(/<\/[^>]+>/g, '$&\n').replace(/<br\s*\/?>/g, '<br>\n'))
    .text()
    .replace(/[\t |　]+/g, ' ')
    .replace(/\s+\n/g, '\n');
};

const newContent = normalizeHtml(text);
const oldContent = normalizeHtml(content);
```

---

### 12. Slack API の Block Kit 移行

**ファイル:** `functions/src/webCrawler.ts`, `functions/src/types/slack.ts`

**現状の問題:**
```typescript
attachments: [
  {
    title: titleText,
    title_link: schedule.uri,
```

**背景:**
- Slack の `attachments` API は 2019 年に非推奨化
- Block Kit が推奨フォーマット

**推奨対応:** 将来的に Block Kit へ移行を検討。現状は動作するため低優先度。

---

## P3: 低優先度（将来的改善）

### 13. jQuery からの脱却

**ファイル:** `public/index.html`, `public/detail.html`

**現状:**
- jQuery 3.7.1 を使用
- DOM 操作とイベントハンドリングに使用

**考慮点:**
- 5年間安定稼働の実績あり
- 書き換えコストと得られるメリットのバランス

**推奨:** 新機能追加時は Vanilla JS で実装し、段階的に移行。

---

### 14. タイムゾーンのハードコード

**ファイル:** `functions/src/webFetcher.ts`, `functions/src/webCrawler.ts`

**現状の問題:**
```typescript
tz: 'Asia/Tokyo'
```

**推奨:** 環境変数化
```typescript
const TIMEZONE = process.env.TZ || 'Asia/Tokyo';
```

---

### 15. 監視・アラート基盤

**現状:** 未実装

**推奨追加:**
- Cloud Monitoring ダッシュボード
- エラー率アラート
- 予算アラート

---

## 開発環境の改善提案

### `.env.example` の追加

```env
# Slack Webhook URL
SLACK_URL=https://hooks.slack.com/services/xxx/xxx/xxx

# Hosting URL (optional, auto-detected if not set)
HOSTING_URL=https://your-project.web.app
```

### ESLint 設定の追加

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "warn"
  }
}
```

### CI/CD パイプラインの追加

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd functions && npm ci
      - run: cd functions && npm run build
      - run: cd functions && npm test
```

---

## まとめ

| 優先度 | 件数 | 主な対象 |
|--------|------|----------|
| P0 | 4件 | Firestore Rules, SSRF対策, クエリ最適化, Functions v2移行 |
| P1 | 4件 | ページネーション, Bootstrap更新, SDK更新, エラーハンドリング |
| P2 | 4件 | テスト追加, 依存関係更新, コード整理, Slack API |
| P3 | 3件 | jQuery移行, タイムゾーン, 監視基盤 |

**推奨アプローチ:**
1. P0 項目を最優先で対応（セキュリティリスク軽減）
2. P1 項目は次回スプリントで対応
3. P2/P3 は新機能開発と並行して段階的に対応

---

*このドキュメントは定期的に見直し、対応状況を更新することを推奨します。*
