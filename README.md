# web_checker

[日本語版 README はこちら / Japanese version](README.ja.md)

An application that monitors web pages for changes and sends notifications to Slack.

Built on Firebase (Cloud Functions v2 + Firestore + Hosting) and written in TypeScript.

## How It Works

1. A scheduled function (`webFetcher`) runs **hourly** (at minute 5).
2. It loads every registered schedule from Firestore and evaluates each schedule's own cron expression to decide whether it is due for a check.
3. Due schedules are published to a Pub/Sub topic, and `webCrawler` fetches each target URL and extracts the element specified by a CSS selector.
4. The extracted content is compared with the previous snapshot (stored in Firestore). If it changed, a diff is posted to Slack via an Incoming Webhook.
5. Creating or editing a schedule (`uri` / `selector`) triggers an immediate check (`webCrawlerOnWrite`).

### Cloud Functions

| Function | Trigger | Role |
|---|---|---|
| `webFetcher` | Scheduler (`5 * * * *`) | Finds schedules due for a check and publishes them to Pub/Sub |
| `webCrawler` | Pub/Sub (`webChecker` topic) | Crawls the page, diffs against the last snapshot, stores archives |
| `webCrawlerOnWrite` | Firestore write on `schedules/{id}` | Runs an immediate check when `uri` or `selector` changes |
| `slackNotifier` | Pub/Sub (`slackNotifier` topic) | Sends the payload to the Slack Incoming Webhook |
| `sendWelcomeEmail` | Auth `onCreate` (v1) | Disables new users and notifies Slack for admin approval |

## Requirements

- Node.js 20 or later
- Firebase CLI
- A Google account
- A Slack workspace (to issue an Incoming Webhook URL)

## Deployment

### 1. Clone the repository

```shell
git clone <repository-url>
cd web_checker
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

### 3. Install the Firebase CLI

```shell
npm install -g firebase-tools
```

Reference: https://firebase.google.com/docs/cli

### 4. Authenticate the Firebase CLI

```shell
firebase login
```

### 5. Link the project to this working directory

```shell
firebase use --add
```

- Select the Firebase project you created
- Enter an alias (e.g. `production`)

Confirm that a `.firebaserc` file has been generated.

### 6. Configure Authentication

1. Firebase console → "Authentication"
2. Click "Get started"
3. "Sign-in method" tab → "Google"
4. Toggle "Enable"
5. Set the project support email
6. Click "Save"

### 7. Configure Firestore

1. Firebase console → "Firestore Database"
2. Click "Create database"
3. Select "Start in production mode"
4. Choose a location (recommended: `us-central1`, which matches the Functions region and stays within the free tier)
5. Click "Enable"

### 8. Install dependencies

```shell
cd functions
npm install
cd ..
```

### 9. Configure the Slack Webhook

#### 9.1 Get a Slack Webhook URL

1. Open the [Slack API](https://api.slack.com/apps) page
2. "Create New App" → "From scratch"
3. Enter an app name (e.g. `Web Checker`) and select your workspace
4. Open "Incoming Webhooks" in the left menu
5. Turn on "Activate Incoming Webhooks"
6. Click "Add New Webhook to Workspace" at the bottom of the page
7. Select the notification channel and click "Allow"
8. Copy the generated Webhook URL

#### 9.2 Create the environment file

Create `functions/.env` and set the Webhook URL:

```shell
cd functions
touch .env
```

Contents of `functions/.env`:

```env
SLACK_URL=https://hooks.slack.com/services/XXXXX/XXXXX/XXXXXXXXXXXXX
```

**Note**: Never commit the `.env` file to Git (it is already listed in `.gitignore`).

### 10. Deploy

```shell
firebase deploy
```

Example output on success:

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

### 11. Approve users

For security, new users are disabled automatically. An administrator must enable them manually from the Firebase console.

#### 11.1 Sign in to the app

1. After deployment, open the Hosting URL (`https://<project-id>.web.app`)
2. Sign in with a Google account
3. New users will not be able to proceed yet

#### 11.2 Check the Slack notification

When a new user signs in, a notification is sent to the configured Slack channel.

#### 11.3 Enable the user

1. Firebase console → "Authentication" → "Users" tab
2. Click the row of the user you want to enable
3. Uncheck "Disable account"
4. Click "Save"

#### 11.4 Sign in again

After the user is enabled:

1. Sign out of the app (or reload the page)
2. Sign in again
3. If the schedule list screen appears, you are all set

## Usage

### Registering a schedule

1. After signing in, fill in the following on the schedule list screen:
   - **Schedule**: crontab format (e.g. `0 * * * *` = every hour on the hour). This controls how often the page is checked. Note that the global scheduler ticks hourly, so intervals shorter than one hour take no effect.
   - **Title**: any name
   - **URL**: the page to monitor
   - **Selector**: a CSS selector (e.g. `#content`, `.main-text`)
   - **Channel**: a Slack channel name (optional; overrides the Webhook default)
2. Click "Add"

## Development

### TypeScript build

This project is written in TypeScript.

```shell
cd functions
npm run build        # one-shot build
npm run build:watch  # rebuild on file changes
```

**Note**: `firebase deploy` runs the build automatically; manual builds are only needed during development.

### Running tests locally

```shell
cd functions
npm test
```

### Verbose test output

```shell
cd functions
npm run devtest
```

### Viewing Functions logs

```shell
cd functions
npm run logs
```

## License

MIT License
