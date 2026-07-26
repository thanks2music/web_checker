# web_checker

[日本語版 README はこちら / Japanese version](README.ja.md)

An application that monitors web pages for changes and sends notifications to Slack.

Built on Firebase (Cloud Functions v2 + Firestore + Hosting), with a Next.js admin UI, written in TypeScript throughout.

## How It Works

1. A scheduled function (`webFetcher`) runs **hourly** (at minute 5).
2. It loads every registered schedule from Firestore and evaluates **each schedule's own cron expression** to decide whether that schedule is due for a check.
3. Due schedules are published to a Pub/Sub topic, and `webCrawler` fetches each target URL and extracts the element specified by a CSS selector.
4. The extracted content is compared with the previous snapshot (stored in Firestore). If it changed, a diff is posted to Slack via an Incoming Webhook.
5. Creating or editing a schedule (`uri` / `selector`) triggers an immediate check (`webCrawlerOnWrite`).

Because the scheduler itself ticks hourly, **a per-schedule interval shorter than one hour has no effect** — a schedule set to `*/10 * * * *` still runs once an hour. The admin UI presents presets rather than free-form cron for this reason.

### Cloud Functions

All functions are 2nd gen and run on the **Node.js 24** runtime.

| Function | Trigger | Memory | Role |
|---|---|---|---|
| `webFetcher` | Scheduler (`5 * * * *`) | 256 MiB | Finds schedules due for a check and publishes them to Pub/Sub |
| `webCrawler` | Pub/Sub (`webChecker` topic) | 256 MiB | Crawls the page, diffs against the last snapshot, stores archives |
| `webCrawlerOnWrite` | Firestore write on `schedules/{id}` | 256 MiB | Runs an immediate check when `uri` or `selector` changes |
| `slackNotifier` | Pub/Sub (`slackNotifier` topic) | 256 MiB | Reads the webhook URL from Secret Manager and posts to Slack |
| `beforeCreate` | Auth blocking (`beforeUserCreated`) | 256 MiB | Creates new users disabled and notifies Slack for admin approval |

> **Note on memory**: every function shares a single `index.ts` bundle, so each one loads the full dependency set (`cheerio`, `axios`, `iconv-lite`, …) at startup. 128 MiB is not enough to boot — the container is OOM-killed before its readiness probe. Keep these at 256 MiB unless the bundle is split per function.

> **Note on the runtime**: `nodejs24` is available for **2nd gen functions only**, and requires **firebase-tools v15 or later** — v14 rejects it as an invalid runtime at deploy time.

## Repository layout

A pnpm workspace with two packages.

```
.
├── firebase.json          # Firestore / Hosting / Functions config
├── .firebaserc            # project aliases (default, debug)
├── firestore.rules        # security rules — the actual access boundary
├── pnpm-workspace.yaml
├── functions/             # @revolution/web-checker-functions (Cloud Functions)
└── web/                   # @revolution/web-checker-web (Next.js admin UI)
    ├── app/               # App Router; (protected) requires an approved account
    ├── components/
    ├── lib/               # firebase client, auth, services, schemas
    └── __tests__/
```

The UI is a **static export** (`output: 'export'`) served by Firebase Hosting. That means there is no middleware and no API routes, and it has a direct consequence worth stating plainly:

> **`firestore.rules` is the only real security boundary.** The auth guard, the pending-approval screen and the redirects are all client-side and bypassable from DevTools. What protects the data is the rules requiring an `approved` custom claim, and ownership checks on write. Switching to a server-rendered deployment would not change this — the browser can always talk to Firestore directly.

## Requirements

- **Node.js 24** (see `.tool-versions`; the Cloud Functions runtime is pinned to `nodejs24`)
- **pnpm 10**
- **firebase-tools v15 or later** (v14 cannot deploy the `nodejs24` runtime). A copy is pinned in the workspace — prefer invoking it through pnpm over a global install.
- A Google account
- A Slack workspace (to issue an Incoming Webhook URL)
- Java 21 or later, to run the Firestore Rules tests locally (required by the emulator)

## Deployment

### 1. Clone and install

```shell
git clone <repository-url>
cd web_checker
pnpm install
```

Run all following steps from the repository root unless noted otherwise.

### 2. Create a Firebase project

1. Open the [Firebase console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter a project name
4. Skip Google Analytics
5. Click "Create project"

Cloud Functions requires the **Blaze (pay-as-you-go)** plan. Upgrade from the bottom left of the console and attach a billing account.

> A single billing account can be linked to five projects by default. If you hit that quota, either unlink an unused project or request an increase.

### 3. Authenticate and link the project

```shell
pnpm --filter @revolution/web-checker-functions exec firebase login
pnpm --filter @revolution/web-checker-functions exec firebase use --add
```

Select the project and enter an alias. Confirm that `.firebaserc` lists it.

### 4. Upgrade Authentication to Identity Platform

The `beforeCreate` blocking function **requires Identity Platform**. Without it, deployment of the Auth binding fails with `Blocking Functions may only be configured for GCIP projects`.

Firebase console → Authentication → Settings → **Blocking functions**, then follow the upgrade prompt. Identity Platform includes a free tier of 50,000 MAU on the Blaze plan. **The upgrade cannot be reverted.**

### 5. Enable Google sign-in

Firebase console → Authentication → "Sign-in method" → Google → enable, set the support email, save.

### 6. Create the Firestore database

Firebase console → Firestore Database → "Create database" → production mode → location `us-central1` (matches the Functions region and stays within the free tier).

### 7. Register a Web app and configure the UI

The admin UI reads its Firebase config from environment variables rather than Hosting's `/__/firebase/init.js`, so the project needs a registered Web app:

```shell
pnpm --filter @revolution/web-checker-functions exec firebase apps:create WEB "Web Checker Admin"
pnpm --filter @revolution/web-checker-functions exec firebase apps:sdkconfig WEB <APP_ID>
```

Copy the values into `web/.env.local` (git-ignored) using `web/.env.example` as the template. All six keys are required; the build fails if any is missing.

> These values are embedded in the JavaScript bundle at build time. That is expected — a Firebase `apiKey` is a project identifier, not a credential. Access control lives in `firestore.rules`.

### 8. Register the Slack webhook in Secret Manager

Create an Incoming Webhook at [api.slack.com/apps](https://api.slack.com/apps) (Create New App → From scratch → Incoming Webhooks → Add New Webhook to Workspace), then:

```shell
pnpm --filter @revolution/web-checker-functions exec \
  firebase functions:secrets:set SLACK_URL_REVOLUTION_WEB_CHECKER
```

Paste the URL at the prompt — nothing is written to your shell history. The CLI enables the Secret Manager API on first use and grants the runtime service account read access during the next deploy.

To rotate the value later, run the same command again (it creates a new version) and then **redeploy `slackNotifier`**, because functions are pinned to the secret version they were deployed with:

```shell
pnpm --filter @revolution/web-checker-functions exec \
  firebase deploy --only functions:slackNotifier
```

> **Do not create `functions/.env` with `SLACK_URL` or `HOSTING_URL`.** The Firebase CLI uploads every entry in that file as a plaintext environment variable on the deployed functions. Neither variable is read by the code any more: the webhook comes from Secret Manager, and the hosting URL is derived from `GCLOUD_PROJECT`.

### 9. Deploy

```shell
pnpm --filter @revolution/web-checker-functions exec firebase deploy
```

`firebase.json` builds both packages as predeploy steps, so no manual build is needed.

For a UI change, previewing before going live is worth the extra step:

```shell
pnpm --filter @revolution/web-checker-functions exec \
  firebase hosting:channel:deploy preview --expires 7d
```

A preview channel serves the new build against the **same Firestore and Auth** while production keeps serving the current one.

### 10. Bind the blocking function

After the first successful deploy:

1. Firebase console → Authentication → Settings → **Blocking functions**
2. Set **Before account creation (`beforeCreate`)** to `beforeCreate(us-central1)`
3. Leave "Before sign-in" as None and all provider-token checkboxes unchecked
4. Save

Until this is saved, new users are created **enabled**, bypassing the approval flow.

### 11. Approve the first user

New users are created disabled and cannot sign in until an administrator approves them. Approval sets both `disabled: false` and the `approved: true` custom claim, which `firestore.rules` requires.

1. Open the Hosting URL and sign in with Google. The attempt is rejected — this is expected — and a Slack notification containing the new UID is sent.
2. Grant approval using that UID:

```shell
gcloud auth application-default login   # first time only
cd functions
pnpm run build
GOOGLE_CLOUD_PROJECT=<project-id> node dist/scripts/setAdmin.js <UID>
```

3. Back in the app, use "承認状態を再確認" on the waiting screen, or sign out and in again.

> A custom claim does not reach an already-issued ID token; it arrives on the next refresh, up to an hour later. The waiting screen has a button that forces the refresh, which is the quickest way through.

## Usage

### Registering a schedule

Sign in, then "スケジュールを追加":

- **タイトル** — any name
- **監視する URL** — must be `https://`
- **CSS セレクタ** — the element to watch (e.g. `#content`, `.main-text`)
- **Slack 通知先** — a channel name, or empty for the webhook default
- **実行頻度** — a preset, or a custom cron expression. The form shows when the next check will actually run.

The first crawl runs immediately and posts a "newly added" notification. Subsequent runs only notify when the selected content changes.

Editing the URL or selector also triggers an immediate re-crawl; the form says so before you save.

You can only edit or delete schedules you created — the rules enforce ownership, and the UI hides the controls accordingly.

## Development

```shell
pnpm install       # install workspace dependencies
pnpm lint          # ESLint across both packages
pnpm type-check
pnpm test          # Jest (both packages)
pnpm build
pnpm dev:web       # Next.js dev server on http://localhost:6060
```

> Port 6060, not 6666 — browsers reserve 6666 for ircu and Next.js refuses to bind it.

### Firestore Rules tests

These run against the Firestore emulator and need a JDK on your PATH:

```shell
pnpm --filter @revolution/web-checker-functions test:rules
```

### Viewing Functions logs

```shell
pnpm --filter @revolution/web-checker-functions exec firebase functions:log
```

## Hosting behaviour worth knowing

Two things about Firebase Hosting are not obvious from a local build, and both were found only by deploying to a preview channel.

**Extensionless paths do not resolve on their own.** The static export writes `out/detail.html`, and Hosting serves that for `/detail.html` — which is what keeps the links in older Slack notifications working. But `/detail` returns 404 unless a rewrite says otherwise, and `next/link` points at `/detail`. `firebase.json` declares a rewrite for each route for this reason.

**Header rules match the request path, not the resolved file.** A rule on `**/*.@(html)` applies to `/index.html` and not to `/`. The clean paths are therefore listed explicitly so that HTML is served `no-cache`; without it, a browser can hold a stale document pointing at content-hashed chunks that a deploy has already removed.

A corollary: `trailingSlash` must stay `false` in `web/next.config.ts`. Setting it to `true` changes the output to `out/detail/index.html`, which would break every historical Slack link at once. CI asserts the flat filenames for exactly this reason.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request against `main`: lint, type-check, unit tests, Firestore Rules tests (emulator with JDK 21), build, and an assertion that the static export still emits the expected flat HTML files. The Node version is read from `.tool-versions` so CI and local development cannot drift apart.

## License

MIT License
