# TDA Project Tracker — Email notifications

This repository uses Firebase Cloud Functions (2nd gen) and Gmail SMTP. Emails show the sender name **TDA Project Tracker** and are delivered to **pisit.seub@gmail.com**.

## What sends an email

- A new project is added to an employee's Firestore document: one notification.
- A project's status changes: one notification.
- Every day at 09:00 (Asia/Bangkok): one digest containing overdue projects that have not previously been reported for the same project and due date.
- Changing a project name or description alone does not send a notification.
- Overdue reminders are sent once per project/due-date combination, not every day.

## One-time setup

### 1. Prepare the Gmail sender account

For the pilot, the Gmail account used as the sender is `pisit.seub@gmail.com`. The visible sender name is still **TDA Project Tracker**.

1. Sign in to that Google account.
2. Open Google Account > Security: https://myaccount.google.com/security
3. Enable 2-Step Verification if it is not already enabled.
4. Open App Passwords: https://myaccount.google.com/apppasswords
5. Create an app password named `TDA Project Tracker`.
6. Copy the generated 16-character app password. Do not put it in this repository, in `firebase-config.js`, or in a chat message.

Google may not show App Passwords for accounts with certain advanced security or organization policies. If that happens, stop here and use an approved email provider or Gmail OAuth setup instead.

### 2. Enable Firebase billing

Cloud Functions and scheduled functions require the Firebase project to use the Blaze (pay-as-you-go) plan. Open https://console.firebase.google.com/project/tda-tracke/usage/details and upgrade only after reviewing the billing account and budget controls.

Cloud Scheduler may incur a small charge. Set a Google Cloud budget alert before enabling production use. A budget alert is not a hard spending cap.

### 3. Install the Firebase CLI

Install Node.js 22, then run:

```bash
npm install -g firebase-tools
firebase login
```

From the repository root:

```bash
npm install --prefix functions
```

### 4. Store SMTP credentials as Firebase secrets

Run these commands from the repository root. The CLI prompts for each value; enter the sender Gmail address and the 16-character App Password when prompted.

```bash
firebase functions:secrets:set SMTP_USER --project tda-tracke
firebase functions:secrets:set SMTP_APP_PASSWORD --project tda-tracke
```

Do not add either value to GitHub files or commit history.

### 5. Deploy the backend functions

```bash
firebase deploy --only functions --project tda-tracke
```

The first deployment may ask to enable Google Cloud APIs and create a service account. Review the prompts and approve the required Firebase/Google Cloud services.

### 6. Test

1. Open the deployed TDA Project Tracker website and sign in as an employee account.
2. Add a test project. The head mailbox should receive a **New project submitted** email.
3. Change that project's status. The head mailbox should receive a **Project status changed** email.
4. To test overdue mail, create a test project with a due date before today and a status other than Completed. The scheduled check runs at 09:00 Thailand time. For an immediate test, use the Firebase/Google Cloud console to invoke the scheduled function only after deployment, or temporarily adjust the schedule in code and redeploy.
5. Check Cloud Functions logs if a message does not arrive. Also check Gmail Spam and Google Account security alerts.

## Important operational notes

- This project currently uses Gmail SMTP with an App Password as a pilot configuration. Gmail is not designed as a high-volume transactional mail service and may block unusual automated sign-ins or enforce sending limits. For a production rollout, prefer a transactional provider with a verified sending domain or a managed Gmail OAuth integration.
- The scheduled overdue digest is sent once per project and due date. If the due date changes, a new overdue notification can be sent for the new due date.
- Firebase Admin SDK writes are server-side and bypass Firestore client security rules. The notification collections are not exposed by the current client adapter.
- Never share the App Password. If it is exposed, revoke it in Google Account settings and set a new Firebase secret.
