# WEBチェッカー モダン化 & Revolution 統合プラン

作成日: 2026-07-25 / 最終更新: 2026-07-26 / 作成: JARVIS

> **本リポジトリは public のため、アカウント識別子は伏字化している。**
> メールアドレス（`<owner-account>`）、請求先アカウント ID（`<billing-account-id>`）、
> および本プロジェクト以外の GCP プロジェクト ID（`<other-gcp-project>`）は、
> 手順の意味を損なわない範囲でプレースホルダに置き換えた。実値は BOSS のみが把握している。

## 1. 目的と全体戦略

WEBチェッカー（本リポジトリ）を Revolution monorepo（`~/work/dev/my-projects/one-more-time/revolution`）の `apps/` に統合する。ただし **統合前に本リポジトリ内で Revolution のモダンな環境水準（pnpm / Node 22 / TS 5.9 / ESLint flat / Next.js 16 + React 19）に到達させ、稼働確認を完了させる**。移植時の差分を最小化するためである。

- **Phase 0〜1 = 本リポジトリ（web-checker）で完結**
- **Phase 2 = Revolution リポジトリでの統合作業**（本リポジトリのスナップショットを squash import）

## 2. BOSS 確定事項（2026-07-25）

| # | 論点 | 決定 |
|---|------|------|
| 1 | Firebase プロジェクト | **新規作成**。名称 `revolution-web-checker`。現行 `debug-web-checker` はあくまで動作確認用 |
| 2 | 定期実行の仕様 | **管理画面でスケジュール毎に設定できるのが正しい仕様**。欠如している場合はデフォルト「1 時間に 1 回」 |
| 3 | フェーズ分け | 先に web-checker リポジトリで整備（React/Next.js 化まで含む）→ 完了後に Revolution へ移植 |
| 4 | git 履歴 | Revolution への持ち込みは**スナップショット（squash import、履歴なし 1 コミット）** |
| 5 | フロントエンド | jQuery + 静的 HTML を **React 化まで本リポジトリで実施**（Phase 1b） |
| 6 | PR #1 | **BOSS が squash マージ済み**（https://github.com/thanks2music/web_checker/pull/1） |
| 7 | `master` → `main` リネーム | **承認済み。JARVIS が実行** |
| 8 | Phase 1b 技術選定 | **承認済み**（Next.js 16 静的エクスポート + Tailwind CSS 4 + modular SDK + FirebaseUI 廃止 → カスタムログイン） |
| 9 | Firebase プロジェクト作成 | **JARVIS が代行**（Blaze 化 = 請求先は準備済みとのこと。不可能な場合は BOSS へ報告） |
| 10 | リージョン | **`us-central1` 継続で確定** |
| 11 | README | **英語化**（`README.md` = 英語を正とする）+ **日本語版は `README.ja.md`** に分離 + 現在の実装に合わせて内容を更新 |

## 3. 現状サマリ（2026-07-25 調査結果）

- TypeScript 化は完了済み（`strict: true`、残存 JS なし、`any` 乱用なし）。TS 5.7。
- `functions/`: Cloud Functions v2（`webFetcher` → Pub/Sub → `webCrawler` → Firestore + `slackNotifier`）。`sendWelcomeEmail` のみ v1 API 残存。Node 20 固定。
- `public/`: 静的 HTML + jQuery 3.7 + Bootstrap 4.6 + Firebase compat SDK v10 + FirebaseUI（Firebase Hosting、`/__/firebase/init.js` 依存）。
- 未導入: ESLint / Prettier / CI（GitHub Actions なし）/ Secret Manager（`SLACK_URL` は `defineString` + `.env` 平文）。
- 既知の課題（2025-12-24 リファクタリングレビューの P0 未対応分）: Firestore Rules 権限不備（他人のスケジュールを更新・削除可能、`approved` claim 未参照）、`webFetcher` の全件取得、SSRF 対策なし。
- ドキュメントと実装の齟齬: README は「5 分毎」、実装 cron は `'5 * * * *'`（毎時 5 分）。→ 決定事項 #2 の仕様に置き換える。
- PR #1（TS 化ブランチ → master）は **BOSS が squash マージ済み**。`master` → `main` リネームは JARVIS 実行待ち。

## 4. Phase 0 — 準備（web-checker リポジトリ）

| # | タスク | 担当 | 状態 |
|---|--------|------|------|
| 0-1a | PR #1 マージ（squash） | BOSS | ✅ 完了（2026-07-25） |
| 0-1b | `master` → `main` リネーム（GitHub 側 + ローカル追随） | JARVIS | ✅ 完了（2026-07-25。マージ済みブランチも削除済み） |
| 0-2 | Slack Incoming Webhook の**ローテーション（再発行）** | BOSS | ⏭️ **今回は見送り**（2026-07-25 BOSS 判断）。Slack 側の 2FA ログイン不能によりローテ不可、現行 URL を継続利用。**再ローテ条件**: Slack ログイン復旧時、またはワークスペースへ他ユーザー参加時。リスク受容の理由は §8.3 参照 |
| 0-3 | Firebase プロジェクト `revolution-web-checker` 新規作成 + 請求先（Blaze）紐付け + Firestore 作成（`us-central1`） | JARVIS + BOSS | ✅ 完了（2026-07-25）: プロジェクト作成 ✅（<owner-account> 配下）/ Firestore 作成 ✅（`us-central1`・無料枠）/ **Blaze 紐付け ✅**（BOSS が <other-gcp-project> のリンク解除 → revolution-web-checker を WE ARE ALL ONE 請求先にリンク） |
| 0-3b | Google 認証（Firebase Authentication → Google プロバイダ）の有効化 | BOSS（コンソール操作） | ✅ 完了（2026-07-25） |
| 0-4 | リージョン確定 | — | ✅ `us-central1` で確定 |
| 0-5 | `docs/`（gitignored の重要レビュー文書）のバックアップ方針確認。Phase 2 で消失させない | JARVIS | 未着手 |
| 0-6 | **README 英語化 + 現行実装への内容更新**。`README.md`（英語・正）+ `README.ja.md`（日本語版）に分離。冒頭に相互リンク。「5 分毎」等の実装との齟齬を是正 | JARVIS | ✅ 完了（2026-07-25。PR #2 マージ済み: https://github.com/thanks2music/web_checker/pull/2）。1a / 1b 完了時にも内容を再同期する（Keep it fresh） |

**0-3 補足 — Blaze 紐付け履歴**: 請求先「WE ARE ALL ONE」（`<billing-account-id>`、<owner-account> 管理）は Google の既定クォータ（1 請求先 5 プロジェクト）上限に達していたため、BOSS が `<other-gcp-project>`（Gemini API 試用の自動生成、未使用）をリンク解除して 1 枠空け、`revolution-web-checker` を紐付けた。解除されたプロジェクトは無料枠 API のみで存続。
| 0-7 | **Slack Webhook URL を Secret Manager へ登録**（シークレット名 **`SLACK_URL_REVOLUTION_WEB_CHECKER`**。手順は §8.1）。今回は現行 URL を継続利用（0-2 見送りのため） | BOSS（コマンド実行） | ✅ 完了（2026-07-25） |
| 0-2b | Slack Webhook のローテーション（再発行）— 遅延実行 | BOSS | Slack 2FA 復旧 or ワークスペースへの他ユーザー参加時。Phase 1a 完了までを目標 |
| 0-8 | 旧 `debug-web-checker` の廃止（仮: **2027-01 〜 2027-07 目安**、急がない） | BOSS 判断 → JARVIS 実行 | Phase 1b 安定稼働後 |

**DoD**: main ブランチが確立し、新 Firebase プロジェクトに `firebase use` できる状態。新 Webhook URL が発行済み。README が英日 2 ファイル体制で現行実装と一致。

## 5. Phase 1a — 基盤モダン化（web-checker リポジトリ）

将来の `apps/web-checker/` の形を先取りしたレイアウトに再構成する。

```
web-checker/
├── firebase.json / .firebaserc（revolution-web-checker 向け）
├── firestore.rules / firestore.indexes.json
├── pnpm-workspace.yaml        ← functions のみ workspace 対象（public/ は Hosting 直下。Phase 1b で `web/` に格上げ）
├── functions/                 ← @revolution/web-checker-functions
└── public/                    ← Phase 1a では現行 jQuery + Bootstrap のまま。Phase 1b で `web/` として Next.js 化
```

### PR 分割（推奨: 5 PR、番号は現時点の想定）

| PR | タイトル | スコープ | 差分量 |
|----|---------|---------|--------|
| PR #3 | 基盤刷新（pnpm / Node 22 / TS 5.9 / firebase-functions v7 / ESLint flat + Prettier） | 設定ファイル中心 + 依存更新に伴う型変更対応。**動作は現行と同等** | 大（依存関係で分けにくい） |
| PR #4 | Secret Manager 化（`defineString` → `defineSecret('SLACK_URL_REVOLUTION_WEB_CHECKER')`）+ `.env` の扱い整理 | `functions/src/index.ts` + `.env.example` 追加 | 小 |
| PR #5 | Firestore Rules P0 修正（オーナーチェック + `approved` claim）+ Rules Unit Test | `firestore.rules` + `functions/test/rules.test.ts` 新規 | 中 |
| PR #6 | 実装品質改善（v1→v2 migration / デバッグ資産除去 / cron 仕様統一 / テスト安定化） | `sendWelcomeEmail` の v1→v2、`crawler.test.ts` モック化、`login-debug.html` / `firebase-debug.log` 削除 | 中 |
| PR #7 | CI 導入（GitHub Actions）+ `revolution-web-checker` へのデプロイ稼働確認 | `.github/workflows/*.yml` 新規、デプロイ確認 | 中 |

**方針**: 各 PR は互いに依存するため順序を守る。PR #3 が最も大きいが、依存パッケージのメジャー更新（firebase-functions v6→v7）は分割の意義が薄いため一括で対応する。個人開発リポジトリ = squash マージを想定。

### タスク詳細

**PR #3: 基盤刷新**
1. **パッケージ管理**: npm → pnpm。`package-lock.json` 削除、`pnpm-lock.yaml` 生成。ルートに `pnpm-workspace.yaml`（`packages: [functions]`）
2. **命名**: `functions/package.json` の name を `@revolution/web-checker-functions` へ改名
3. **ランタイム**: Node 20 → **22**（`functions/package.json` の `engines.node` + `firebase.json` の `functions.runtime: "nodejs22"` 明示。公式サポート確認済み: firebase.google.com/docs/functions/manage-functions）
4. **依存更新**: TypeScript 5.9、`firebase-functions` v6 → v7（メジャー更新のため公式 migration guide を Context7 で先に確認）、`firebase-admin` 最新
5. **Lint/Format**: ESLint flat config（Revolution `apps/ai-writer/eslint.config.mjs` パターン踏襲）+ Prettier 導入。`pnpm lint` で全ファイルが green になるまで整形

**PR #4: Secret Manager 化**
6. `functions/src/index.ts` の `defineString('SLACK_URL')` → `defineSecret('SLACK_URL_REVOLUTION_WEB_CHECKER')` へ移行
7. 関連関数（`webCrawler`, `slackNotifier`）に `secrets: [SLACK_URL_REVOLUTION_WEB_CHECKER]` を宣言（v7 API で読み取り権限自動バインド）
8. `functions/.env` を `.env.example` 化（現行値の書き換えは BOSS がローカルで実施）
9. `HOSTING_URL` は Firebase Hosting の予約 URL から `process.env.GCLOUD_PROJECT` 経由で算出可能。廃止判断は PR 内で提示

**PR #5: Firestore Rules P0 修正**
10. `firestore.rules` にオーナーチェック（`createdUser` == `request.auth.uid`）+ `approved` custom claim 参照を追加
11. `@firebase/rules-unit-testing` で Rules Unit Test 新設: 「未承認ユーザーは read 不可」「他人のスケジュールを update/delete できない」「archives への直接 write は禁止」の 3 ケース最小

**PR #6: 実装品質改善**
12. **v1 API 撲滅**: `sendWelcomeEmail` を v1 `auth.user().onCreate` → v2 `beforeUserCreated`（blocking function）へ移行。既存の「新規ユーザーを `disabled: true` にする」処理を v2 の適切な位置へ再配置
13. **cron 仕様**: 決定事項 #2 に従い、グローバル `webFetcher` の cron を「毎時 5 分（`5 * * * *`）」で固定、新規スケジュールのフロントエンドデフォルト値を「1 時間に 1 回（`0 * * * *`）」に。README / 実装 / UI 表示の齟齬を解消
14. **デバッグ資産除去**: `public/login-debug.html`、`firebase-debug.log`（コミット済み）を削除。`.firebaserc` と gitignore の矛盾を整理
15. **テスト安定化**: `functions/src/test/crawler.test.ts` の実ネットワーク依存（`https://www.google.com` 直叩き）を `msw` or `nock` でモック化

**PR #7: CI + デプロイ稼働確認**
16. **CI 新設**: `.github/workflows/ci.yml`（pnpm setup、`pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm build` の 4 job）
17. **新プロジェクトへデプロイ**: `revolution-web-checker` へ Functions + Firestore rules/indexes + Hosting をデプロイし、E2E 稼働確認（`debug-web-checker` と並行稼働で比較）

### DoD（受け入れ基準）— ✅ 2026-07-26 達成
- ✅ `pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm build` が全通過、CI green（PR #4 で確認）
- ✅ 新プロジェクト上で「スケジュール登録 → クロール → Slack 通知」が実動作（「日常組」で検証）
- ✅ Slack 通知が `SLACK_URL_REVOLUTION_WEB_CHECKER`（Secret Manager 管理・version 2）で届く
- ✅ Rules Unit Test 7 ケース green（未承認 read 不可 / 他人の update・delete 不可 / archives 直接 write 不可）
- ✅ 通知内「差分一覧」リンクが `revolution-web-checker.web.app` を指す（`HOSTING_URL` param 廃止 → `GCLOUD_PROJECT` 自動導出が正しく動作）

### Phase 1a デプロイで顕在化した問題と対処（記録）

| 事象 | 原因 | 対処 |
|---|---|---|
| `beforeCreate` のデプロイ失敗 | blocking function の `timeoutSeconds` は 0〜7 秒制約。60 を指定していた | 7 に変更（commit `c3c9a37`） |
| Cloud Build の npm ERESOLVE | `firebase-functions-test@3.5.0` の peer が firebase-admin ≤v13。Cloud Build は npm で解決するため衝突 | 未使用だったため削除（commit `c3c9a37`） |
| Blocking function が Auth に紐付かない | Identity Platform (GCIP) 未有効 | BOSS が Identity Platform へアップグレード → Console で `beforeCreate` を紐付け |
| Hosting が Site Not Found | functions のエラーでデプロイが中断し、Hosting の release ステップまで到達していなかった | `--only hosting` で単独デプロイし確定リリース |
| **Slack 通知が一切届かない** | **`slackNotifier` が起動時 OOM（128MiB 上限に対し 134MiB）。全関数が同一バンドルを共有し cheerio/axios 等をロードするため。firebase-admin v13→v14 で限界超過** | **`webFetcher` / `slackNotifier` を 256MiB へ引き上げ（PR #5）** |

**Phase 1b への申し送り**: バンドル分割（関数ごとに必要な依存だけをロード）を行えばメモリを下げられる。React 化に伴う構成見直しと同時に検討する。

### 残タスク（Phase 1b 着手前）— ✅ 2026-07-26 全クローズ

| # | タスク | 担当 | 状態 |
|---|--------|------|------|
| 1a-x1 | PR #5（OOM 修正）のマージ | BOSS | ✅ 完了 |
| 1a-x2 | Slack 側で旧 Incoming Webhook を削除 | BOSS | ⏭️ **対応不要と判断**（2026-07-26 BOSS）。Secret Manager の version 1 破棄により参照経路は断たれている。旧 URL 自体の失効が必要になった時点で再検討 |
| 1a-x3 | Secret Manager の旧 version 1 を破棄 | JARVIS | ✅ 完了（2026-07-26T03:48:36、DESTROYED） |
| 1a-x4 | README を Phase 1a の実態に再同期 | JARVIS | ✅ 完了（PR #6。Node 24 化と同一 PR） |
| 1a-x5 | **Node 24 化**（当初計画の Node 22 から変更。GCP 実データで `nodejs24` GA を確認、Revolution 側 `.tool-versions` と統一） | JARVIS | ✅ 完了（PR #6） |

**Node 24 に関する重要な制約（Phase 2 への申し送り）**:
- `nodejs24` は **2nd gen 専用**。Phase 1a で v1 トリガーを撲滅済みだから選べた（v1 が 1 つでも残っていれば Node 22 が上限だった）
- デプロイには **firebase-tools v15 以降**が必須。v14 は `nodejs24` を「不正なランタイム」として API 到達前に弾く。BOSS のグローバル CLI は v14.18.0 のため、workspace の v15.24.0 を pnpm 経由で使う運用とした
- Revolution 統合時の CI/CD でも firebase-tools のバージョン固定が必要

**デプロイ時に発見したシークレット混入（対処済み）**: 2025-12 作成の `functions/.env` が残っており、Firebase CLI がその全キー（旧 `SLACK_URL` / 旧 `HOSTING_URL`）を**デプロイ済み関数の平文環境変数としてアップロード**していた。コードからは未参照のため機能影響はなかったが、`.env` を退避して再デプロイし除去。README に再発防止の警告を追記済み。

## 6. Phase 1b — React / Next.js 化（web-checker リポジトリ)

### 技術選定（2026-07-25 BOSS 承認済み）

- **Next.js 16（App Router）+ React 19 + `output: 'export'`（静的エクスポート）** で Firebase Hosting へ配置
  - 管理画面はログイン必須のクライアントサイド CRUD であり SSR 不要。静的エクスポートなら Hosting 構成が現行と同じで済む
  - Revolution の `apps/ai-writer` / `apps/frontend`（いずれも Next.js 16 + React 19）とスタック統一され、Phase 2 の移植がほぼコピーで済む
- **Tailwind CSS 4**（Bootstrap 4 廃止。BOSS の個人開発標準スタックに一致）
- **Firebase JS SDK modular（v12 系）**（compat 廃止）。`/__/firebase/init.js` 自動注入は使わず、Hosting 予約 URL 非依存の firebaseConfig 管理へ（public config を env 経由で注入)
- **FirebaseUI 廃止**: FirebaseUI Web は実質メンテナンス停止のため、modular SDK の `signInWithPopup(GoogleAuthProvider)` によるカスタムログインへ置換
- **Zod** で Firestore ドキュメントのスキーマ定義（Phase 2 で `shared/schemas` へ移設できる形に）

### 機能パリティ + 改善

| 画面 | 現行 | React 化後 |
|------|------|-----------|
| 一覧（index） | 全件取得・jQuery 描画 | 一覧 + 追加/編集/削除。**ページネーション導入**（P1 課題解消） |
| 詳細（detail） | archives 全件 `<pre>` ダンプ | 履歴一覧 + 差分表示。ページネーション |
| ログイン | FirebaseUI + Google | カスタム UI + `signInWithPopup` |
| スケジュール設定 | cron 文字列直接入力 | **実行頻度をスケジュール毎に設定できる UI**（決定事項 #2 の正式仕様化。デフォルト 1 時間に 1 回） |

**DoD（受け入れ基準）**:
- 上記 4 画面の機能パリティ（既存機能の欠落ゼロ）+ ページネーション動作
- `next build`（静的エクスポート）が CI で通過し、Firebase Hosting で稼働
- 認証フロー（未承認ユーザーの disabled 挙動含む）がエミュレータ + 実環境で確認済み
- Playwright（またはエミュレータ + component test）で主要フロー（ログイン → スケジュール追加 → 一覧反映）の自動テスト
- jQuery / Bootstrap / compat SDK / FirebaseUI への依存ゼロ

## 7. Phase 2 — Revolution 統合（Revolution リポジトリ）

概要のみ（着手時に Revolution 側で詳細プラン化 + Todoist 起票 + `task-priority-mapping.md` 反映）。

1. 本リポジトリ HEAD のスナップショットを `apps/web-checker/` へ squash import（履歴なし 1 コミット。Revolution は Public リポジトリのため履歴持ち込みは行わない）
2. package name はそのまま（`@revolution/web-checker-*`）。pnpm workspace には `apps/*` glob で自動包含
3. ルート `package.json` の `dev`/`build` filter、`turbo.json` の `build.env`（Firebase/Slack 系）への追加
4. CI（`ci.yml`）へ lint/type-check/build/test を組み込み
5. `deploy-web-checker.yml` 新設（`deploy-ai-writer.yml` の Workload Identity Federation パターン流用、Firebase Hosting + Functions デプロイ）
6. **要検証**: pnpm monorepo からの Functions デプロイ（Cloud Build 側の依存解決）。`workspace:*` 依存を持たせない限り素通りする想定だが、`shared/schemas` 参照を入れる場合は isolate 系対策（`firebase-tools` の isolate オプション等）を検証
7. ルート `.env.local.example` への変数追記（CLAUDE.md ルールにより BOSS 承認必須）
8. 旧リポジトリ `thanks2music/web_checker` のアーカイブ化

**DoD**: Revolution monorepo の CI で web-checker が green、monorepo からのデプロイで従来と同一の監視・通知が稼働。

## 8. 未確定事項

### 解決済み（2026-07-25 第 2 回 BOSS 回答）

- ~~Q1 マージ方式~~ → BOSS が squash マージ済み
- ~~Q2 `master` → `main` リネーム~~ → 承認、JARVIS 実行
- ~~Q3 Phase 1b 技術選定~~ → 承認
- ~~Q4 Firebase プロジェクト作成の実行者~~ → JARVIS 代行（不可時報告）
- ~~Q5 リージョン~~ → `us-central1` 継続

### 解決済み（2026-07-25 第 3 回 BOSS 回答）

- ~~Q-A 新 Slack Webhook URL の受け渡し方法~~ → **BOSS がコマンドで Secret Manager に直接登録**（手順は下記 §8.1）。シークレット名は事前確認の上確定する
- ~~Q-B 旧 `debug-web-checker` の廃止タイミング~~ → **仮決定: 半年〜1 年以内（2027-01 〜 2027-07 目安）に廃止**。急がない。Phase 1a〜1b 中は新旧並行稼働で比較検証に利用

### 8.1 Slack Webhook シークレット登録手順（BOSS 実行）

**シークレット名（= コード側 `defineSecret()` のパラメータ名）: `SLACK_URL_REVOLUTION_WEB_CHECKER`**

命名理由: Revolution 配下で複数の Slack 通知先が並立する将来（例: ai-writer 用の Slack 通知）を見越して、プロジェクト・用途を含む具体名にする。Phase 1a でコード側の `defineString('SLACK_URL')` も `defineSecret('SLACK_URL_REVOLUTION_WEB_CHECKER')` へ改名して整合させる。

**前提**: Phase 0-3 完了（`revolution-web-checker` プロジェクト存在 + Blaze 紐付け済み）、`firebase login` 済み（<owner-account>）。

**実行ディレクトリ**: `/Users/yoshi/work/dev/my-projects/web-checker`（`firebase.json` のあるリポジトリルート）

```bash
cd /Users/yoshi/work/dev/my-projects/web-checker

# 登録（対話プロンプトに新しい Webhook URL を貼り付けて Enter。
# シェル履歴に値が残らない方式。Secret Manager API が未有効なら自動で有効化を促される）
firebase functions:secrets:set SLACK_URL_REVOLUTION_WEB_CHECKER \
  --project revolution-web-checker

# 登録値の確認（ターミナルに値が表示される点だけ注意）
firebase functions:secrets:access SLACK_URL_REVOLUTION_WEB_CHECKER \
  --project revolution-web-checker
```

- ローカル開発・エミュレータ用は、BOSS が `functions/.env`（gitignored）へ `SLACK_URL_REVOLUTION_WEB_CHECKER=...` を直接記入する
- `HOSTING_URL` はシークレットではないため登録不要（Phase 1a で `.env` / パラメータ管理のまま整理）
- Functions への読み取り権限バインドは、`defineSecret` 化後の初回 `firebase deploy` 時に CLI が自動で設定する

### 8.2 Google 認証の有効化手順（BOSS 実行）

Firebase Authentication の Google プロバイダは Firebase コンソール上でのみ有効化できるため、下記手順で BOSS に実施いただく（Firebase CLI からの一括有効化は非対応）。

1. [Firebase Authentication プロバイダ画面](https://console.firebase.google.com/project/revolution-web-checker/authentication/providers) を開く（`<owner-account>` でログイン）
2. 「始める」をクリック（初回のみ）
3. 「Sign-in method」タブ →「Google」を選択
4. 「有効にする」トグルをオン
5. **プロジェクトのサポートメール**: `<owner-account>`（または適切なアドレス）を選択
6. 「保存」をクリック

**完了確認**: 同画面の Sign-in providers 一覧で「Google」が Enabled になっていれば OK。

### 8.3 Slack Webhook ローテーション見送りのリスク受容

**判断（2026-07-25）**: BOSS の Slack 2FA 認証が一時的にログイン不能状態（`WE ARE ALL ONE` ワークスペース、"You've been trying to log in too often" レートリミット）のため、今回はローテーションを行わず現行 URL を Secret Manager に転記して継続利用する。

**受容するリスク**:
- 現行 URL は本セッションの調査ログ、および `docs/review/2025-12-24-Refactoring-Candidates-Summary.md` などの過去レビュー文書（gitignored、ローカルのみ）に露出している
- 悪用時の被害範囲は **BOSS 個人所有ワークスペースの受信チャンネルへの意図しない通知** に限定される（受信者は BOSS のみ、送信の一方向、認証情報などの窃取経路ではない）

**再ローテーション条件**（Phase 0-2b として遅延実行）:
1. Slack 2FA ログインが復旧したら速やかに再発行
2. または `WE ARE ALL ONE` ワークスペースに BOSS 以外のメンバーが参加するタイミング
3. Phase 1a 完了（実サイトへの本稼働開始）までには再発行を完了させることを目標
