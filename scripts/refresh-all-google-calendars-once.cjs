/**
 * One-time migration: refresh every existing Google Calendar event for all connected users
 * with the latest descriptive format (review lists, linked tasks, links, CANCELED titles, etc.).
 *
 * Run: npm run migrate:google-calendars
 * Re-run (ignore migration flag): npm run migrate:google-calendars -- --force
 */

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { loadServiceAccount } = require("./load-service-account.cjs");
const { ensureGoogleOAuthClientSecret } = require("./ensure-google-oauth-secret.cjs");
const { refreshAllConnectedGoogleCalendarsOnce } = require("../functions/lib/sync");

const force = process.argv.includes("--force");

ensureGoogleOAuthClientSecret();

if (!getApps().length) {
  initializeApp({ credential: cert(loadServiceAccount()) });
}

const db = getFirestore();

refreshAllConnectedGoogleCalendarsOnce(db, { force })
  .then((result) => {
    if (result.skipped) {
      console.log("Migration already completed — use --force to run again.");
      process.exit(0);
    }
    console.log(
      `Done. ${result.users} connected user(s), ${result.events} event(s) refreshed.`
    );
    if (result.errors.length > 0) {
      console.warn("Errors:");
      for (const err of result.errors) console.warn(`  ${err}`);
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
