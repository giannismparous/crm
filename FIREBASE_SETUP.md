# Firebase + Google Auth setup (SimasiaAI CRM)

All paths below are relative to the **`crm`** folder unless noted.

## 1. Create the Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) → **Add project** → name it (e.g. `simasia-ai`).
2. Enable **Google Analytics** only if you want it (optional).

## 2. Register a Web app and get client keys

1. Project **gear** → **Project settings** → **Your apps** → **Web** (`</>`).
2. Register app (name e.g. `SimasiaAI Web`).
3. Copy the config values into **`crm/.env`** (create from **`.env.example`**):

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN` (usually `PROJECT_ID.firebaseapp.com`)
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET` (Console shows `PROJECT_ID.firebasestorage.app` or legacy `PROJECT_ID.appspot.com` — use the exact bucket string from Project settings)
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

**Never commit `.env`.** It is gitignored.

## 3. Enable Authentication (Email / password)

1. Firebase Console → **Build** → **Authentication** → **Get started**.
2. **Sign-in method** → **Email/Password** → Enable the first toggle (Email/Password) → **Save**.  
   (You do **not** need Google for this app’s helpers — `src/firebase/config.ts` uses email sign-in / register / reset.)

Optional: **Settings** → **Authorized domains** → ensure `localhost` is listed for local dev.

## 4. Enable Firestore

1. **Build** → **Firestore Database** → **Create database**.
2. Choose a region close to your users.
3. Start in **production** mode (we deploy rules next).

## 5. Install Firebase CLI and link the project (for rules deploy)

```bash
npm install -g firebase-tools
firebase login
cd crm
```

Edit **`.firebaserc`** and replace `YOUR_FIREBASE_PROJECT_ID` with your real **Project ID** (same as `VITE_FIREBASE_PROJECT_ID`).

Deploy rules:

```bash
firebase deploy --only firestore:rules,storage
```

Or paste **`storage.rules`** in Console → **Storage** → **Rules** → **Publish** (required for image uploads).

Rules live in **`firestore.rules`**. They require a **signed-in user** for `organizations/...` and `users/{uid}`.

## 6. Service account (for seeding only — server-side)

The seed script uses **Admin SDK** and bypasses security rules. Use a **private key** only on your machine or CI, never in the client.

1. Console → **Project settings** → **Service accounts** → **Generate new private key**.
2. Save the JSON file as **`crm/serviceAccount.json`** (gitignored), **or** set:

   ```bash
   set FIREBASE_SERVICE_ACCOUNT_PATH=C:\path\to\your-key.json
   ```

   (PowerShell: `$env:FIREBASE_SERVICE_ACCOUNT_PATH="..."`)

## 7. Install npm deps and seed test data

```bash
cd crm
npm install
npm run seed:firestore
```

**Create a real Auth user + seed in one go** (sets `people/{uid}`, `users/{uid}`, a welcome task, then the same Firestore seed):

```powershell
cd crm
$env:BOOTSTRAP_EMAIL="you@example.com"
$env:BOOTSTRAP_PASSWORD="your-secure-password"
$env:BOOTSTRAP_DISPLAY_NAME="Your Name"
npm run bootstrap:user
```

This runs **`scripts/seed-firestore.cjs`** with **`node --env-file=.env`**, so variables from **`crm/.env`** are loaded (including **`FIREBASE_SERVICE_ACCOUNT_PATH`** if you put the path there instead of using `serviceAccount.json` in the project folder).

If `npm install` leaves broken `grpc` / `internal-channel` errors (Windows file locks), close editors/terminals using the project, delete **`crm/node_modules`**, then run **`npm install`** again.

This writes:

- `organizations/SimasiaAI` — org metadata  
- `organizations/SimasiaAI/people/{p1…}`  
- `organizations/SimasiaAI/tasks/{t1…}`  
- `organizations/SimasiaAI/contacts/{c1…}` (no nested `reminders` array on the doc)  
- `organizations/SimasiaAI/contacts/{cId}/reminders/{rId}` — each reminder as its own doc  

Same logical data as **`src/data/seed.ts`**.

## 8. Client code in this repo (no UI wired yet)

- **`src/firebase/config.ts`** — initializes the web app, Firestore, and **email** auth helpers: `registerWithEmail`, `signInWithEmail`, `signOutUser`, `sendPasswordReset`. Optional: `getFirebaseAnalytics()` if `VITE_FIREBASE_MEASUREMENT_ID` is set.

When you add a login form later:

```ts
import { signInWithEmail } from "./firebase/config";
await signInWithEmail(email, password);
```

## 9. Optional: user profile doc on first login

Rules already allow `users/{userId}` read/write when `request.auth.uid == userId`. After `signInWithGoogle()`, you can `setDoc(doc(db, "users", user.uid), { email, displayName, ... })` from your app (later).

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| Seed fails “permission denied” | Service account JSON path; Firestore enabled in same project |
| `Missing env VITE_*` on `npm run dev` | `.env` present in `crm` with all six `VITE_FIREBASE_*` keys |
| Google popup blocked / unauthorized domain | Only if you use Google; for email auth, check **Authorized domains** if the app is not on localhost |
| Rules reject client reads | User must be signed in; deploy latest `firestore.rules` |
