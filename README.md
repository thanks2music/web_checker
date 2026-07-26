# web_checker

[日本語版 README はこちら / Japanese version](README.ja.md)

An application that monitors web pages for changes and sends notifications to Slack.

Built on Firebase (Cloud Functions v2 + Firestore + Hosting) and written in TypeScript.

## How It Works

1. A scheduled function (`webFetcher`) runs **hourly** (at minute 5).
2. It loads every registered schedule from Firestore and evaluates **each schedule's own cron expression** to decide whether that schedule is due for a check.
3. Due schedules are published to a Pub/Sub topic, and `webCrawler` fetches each target URL and extracts the element specified by a CSS selector.
4. The extracted content is compared with the previous snapshot (stored in Firestore). If it changed, a diff is posted to Slack via an Incoming Webhook.
5. Creating or editing a schedule (`uri` / `selector`) triggers an immediate check (`webCrawlerOnWrite`).

Because the scheduler itself ticks hourly, a per-schedule interval shorter than one hour has no effect.

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

## Requirements

- **Node.js 24** (see `.tool-versions`; the Cloud Functions runtime is pinned to `nodejs24`)
- **pnpm 10** (this repository is a pnpm workspace)
- **firebase-tools v15 or later** (v14 cannot deploy the `nodejs24` runtime)
- A Google account
- A Slack workspace (to issue an Incoming Webhook URL)
- Java 21 or later, if you want to run the Firestore Rules tests locally (required by the emulator)

## Repository layout

```
.
├── firebase.json          # Firestore / Hosting / Functions config
├── .firebaserc            # project aliases (default, debug)
├── firestore.rules        # security rules
├── pnpm-workspace.yaml    # workspace root (scopes to functions/)
├── functions/             # @revolution/web-checker-functions (Cloud Functions)
└── public/                # static admin UI served by Firebase Hosting
```

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
3. Enter a project name (e.g. `web-checker-prod`)
4. Skip Google Analytics
5. Click "Create project"

#### Upgrade the billing plan

Cloud Functions requires the Blaze (pay-as-you-go) plan.

1. Click "Upgrade" (Spark) at the bottom left of the Firebase console
2. Select "Blaze (pay as you go)"
3. Set up a billing account (create one in Google Cloud if you don't have one)

> A single billing account can be linked to five projects by default. If you hit that quota, either unlink an unused project or request an increase.

### 3. Authenticate the Firebase CLI

```shell
pnpm --filter @revolution/web-checker-functions exec firebase login
```

The pinned firebase-tools lives in the workspace, so prefer invoking it through pnpm rather than a globally installed `firebase` (a global v14 will fail on the `nodejs24` runtime).

### 4. Link the project to this working directory

```shell
pnpm --filter @revolution/web-checker-functions exec firebase use --add
```

- Select the Firebase project you created
- Enter an alias (e.g. `production`)

Confirm that `.firebaserc` lists the alias.

### 5. Upgrade Authentication to Identity Platform

The `beforeCreate` blocking function **requires Identity Platform**. Without it, deployment of the Auth binding fails with `Blocking Functions may only be configured for GCIP projects`.

1. Firebase console → Authentication → Settings → **Blocking functions**
2. Follow the "Upgrade to Identity Platform" prompt and confirm

Identity Platform includes a free tier of 50,000 MAU on the Blaze plan. **The upgrade cannot be reverted.**

### 6. Enable Google sign-in

1. Firebase console → "Authentication"
2. Click "Get started"
3. "Sign-in method" tab → "Google"
4. Toggle "Enable"
5. Set the project support email
6. Click "Save"

### 7. Create the Firestore database

1. Firebase console → "Firestore Database"
2. Click "Create database"
3. Select "Start in production mode"
4. Choose a location (recommended: `us-central1`, which matches the Functions region and stays within the free tier)
5. Click "Enable"

### 8. Register the Slack webhook in Secret Manager

#### 8.1 Get a Slack Webhook URL

1. Open the [Slack API](https://api.slack.com/apps) page
2. "Create New App" → "From scratch"
3. Enter an app name (e.g. `Web Checker`) and select your workspace
4. Open "Incoming Webhooks" in the left menu
5. Turn on "Activate Incoming Webhooks"
6. Click "Add New Webhook to Workspace" at the bottom of the page
7. Select the notification channel and click "Allow"
8. Copy the generated Webhook URL

#### 8.2 Store it in Cloud Secret Manager

The webhook URL is a secret and is **not** kept in a `.env` file. `slackNotifier` declares it via `defineSecret` and Firebase mounts it at runtime.

```shell
pnpm --filter @revolution/web-checker-functions exec \
  firebase functions:secrets:set SLACK_URL_REVOLUTION_WEB_CHECKER
```

Paste the URL at the prompt. Nothing is written to your shell history. The CLI enables the Secret Manager API on first use and grants the runtime service account read access during the next deploy.

To rotate the value later, run the same command again — it creates a new version — then **redeploy `slackNotifier`**, because functions are pinned to the secret version they were deployed with:

```shell
pnpm --filter @revolution/web-checker-functions exec \
  firebase deploy --only functions:slackNotifier
```

> **Do not create `functions/.env` with `SLACK_URL` or `HOSTING_URL`.** The Firebase CLI uploads every entry in that file as a plaintext environment variable on the deployed functions. Neither variable is read by the code any more: the webhook comes from Secret Manager, and the hosting URL is derived from `GCLOUD_PROJECT`. `.env.example` documents the only key you may need for local work.

### 9. Deploy

```shell
pnpm --filter @revolution/web-checker-functions exec firebase deploy
```

`firebase.json` runs the TypeScript build as a predeploy step, so no manual build is needed.

### 10. Bind the blocking function

After the first successful deploy, the function must be wired into the auth flow:

1. Firebase console → Authentication → Settings → **Blocking functions**
2. Set **Before account creation (`beforeCreate`)** to `beforeCreate(us-central1)`
3. Leave "Before sign-in" as None, and leave all "provider token credentials" checkboxes unchecked
4. Click "Save"

Until this is saved, new users are created **enabled**, bypassing the approval flow.

### 11. Approve the first user

New users are created disabled and cannot sign in until an administrator approves them. Approval sets both `disabled: false` and the `approved: true` custom claim, which `firestore.rules` requires.

1. Open the Hosting URL (`https://<project-id>.web.app`) and sign in with Google. The attempt is rejected — this is expected — and a Slack notification containing the new UID is sent.
2. Grant approval using that UID:

```shell
gcloud auth application-default login   # first time only
cd functions
pnpm run build
GOOGLE_CLOUD_PROJECT=<project-id> node dist/scripts/setAdmin.js <UID>
```

3. Sign out and sign in again. The schedule list should now load.

## Usage

### Registering a schedule

1. After signing in, fill in the following on the schedule list screen:
   - **Schedule**: crontab format (e.g. `0 * * * *` = hourly, the default). Intervals shorter than one hour have no effect.
   - **Title**: any name
   - **URL**: the page to monitor
   - **Selector**: a CSS selector (e.g. `#content`, `.main-text`)
   - **Channel**: a Slack channel name (optional; overrides the webhook default)
2. Click "Add"

The first crawl runs immediately and posts a "newly added" notification. Subsequent runs only notify when the selected content changes.

## Development

```shell
pnpm install       # install workspace dependencies
pnpm lint          # ESLint (flat config, type-aware rules)
pnpm type-check    # tsc --noEmit
pnpm test          # Jest unit tests (network calls are mocked with nock)
pnpm build         # tsc
```

### Firestore Rules tests

These run against the Firestore emulator and need a JDK on your PATH:

```shell
pnpm --filter @revolution/web-checker-functions test:rules
```

### Watching logs

```shell
pnpm --filter @revolution/web-checker-functions exec firebase functions:log
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request against `main`: lint, type-check, unit tests, Firestore Rules tests (emulator with JDK 21), and build. The Node version is read from `.tool-versions` so CI and local development cannot drift apart.

## License

MIT License
