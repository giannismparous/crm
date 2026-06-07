# Google Calendar integration

Each CRM user can connect **their own** Google account. Tasks, appointments, and personal reminders they are part of sync to their Google Calendar.

## What syncs

| CRM item | Google Calendar event |
|----------|----------------------|
| **Task** (you are assignee or creator) | All-day event on `dueDate` |
| **Appointment** (you are participant or creator) | Timed event (`startsAt` → `endsAt`) |
| **Personal reminder** (you own or are shared on) | Timed event at `dueAt` (30 min) |

Done/canceled tasks, canceled appointments, and completed reminders are removed from Google Calendar.

## Architecture

- **Frontend** (`src/firebase/googleCalendar.ts`) — callable functions + user menu UI
- **Cloud Functions** (`functions/`) — OAuth, token storage, Calendar API calls
- **Firestore** — `users/{uid}/integrations/googleCalendar` (tokens; client cannot read)
- **OAuth callback** — HTTPS function `googleCalendarOAuthCallback`

---

## 1. Google Cloud Console (one-time)

Use the same Google Cloud project as Firebase (`crm-product-3e233` or yours).

### Enable API

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Library**
2. Search **Google Calendar API** → **Enable**

### OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**
2. User type: **External** (or Internal if Google Workspace only)
3. App name, support email, developer contact
4. **Scopes** → add: `https://www.googleapis.com/auth/calendar.events`
5. **Test users** — add Gmail accounts that will connect while app is in "Testing"

### OAuth client ID

1. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**
2. Type: **Web application**
3. **Authorized redirect URIs** — add (after first deploy):

   ```
   https://us-central1-<YOUR_PROJECT_ID>.cloudfunctions.net/googleCalendarOAuthCallback
   ```

   Example: `https://us-central1-crm-product-3e233.cloudfunctions.net/googleCalendarOAuthCallback`

4. Copy **Client ID** and **Client secret**

---

## 2. Install & deploy Cloud Functions

```bash
cd crm/functions
npm install
cd ..
```

Set Firebase params and secret (replace values):

```bash
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET

# When prompted, paste your Google OAuth client secret.

firebase functions:config:set noop=1   # optional legacy; params below are preferred

# Preferred — Firebase Functions params (v2):
firebase functions:params:set GOOGLE_OAUTH_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"
firebase functions:params:set GOOGLE_OAUTH_REDIRECT_URI="https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/googleCalendarOAuthCallback"
firebase functions:params:set CRM_APP_URL="https://YOUR_NETLIFY_SITE.netlify.app"
```

For local dev, `CRM_APP_URL` can be `http://localhost:5173`.

Deploy functions, Firestore rules, and indexes:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes
```

After deploy, confirm the callback URL in Google Console matches `GOOGLE_OAUTH_REDIRECT_URI` exactly.

---

## 3. Blaze plan required

Cloud Functions that call external APIs (Google Calendar) require the Firebase project on the **Blaze (pay-as-you-go)** plan. The free tier still includes generous function invocations.

---

## 4. Use in the CRM

1. Sign in to the CRM
2. Click your name (top right) → **Google Calendar**
3. **Connect Google Calendar** → Google sign-in → allow calendar access
4. You are redirected back; initial sync runs automatically
5. Toggle what to sync (tasks / appointments / reminders)
6. **Sync now** — full resync anytime

New/edited CRM items sync automatically in the background.

---

## 5. Troubleshooting

| Problem | Fix |
|---------|-----|
| `functions/not-found` in browser | Deploy functions; region must be `us-central1` |
| Redirect URI mismatch | Redirect URI in Google Console must match `GOOGLE_OAUTH_REDIRECT_URI` byte-for-byte |
| `access_denied` / app not verified | Add user as **Test user** on OAuth consent screen |
| No refresh token | Disconnect app at [Google Account permissions](https://myaccount.google.com/permissions), reconnect |
| Events missing for other participants | They must connect their own Google Calendar; sync is per-user |
| `collection group` index error | Run `firebase deploy --only firestore:indexes` and wait for index build |

---

## 6. Security notes

- OAuth **client secret** lives only in Firebase Functions secrets — never in the frontend or git
- Refresh tokens are stored in Firestore; rules block client read/write on `integrations/`
- Each user only syncs items they are relevant to (assignee, participant, owner)
- Disconnect revokes the Google token and deletes local mappings
