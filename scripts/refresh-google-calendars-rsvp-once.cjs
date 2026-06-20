/**
 * One-time migration: refresh every mapped Google Calendar event with RSVP poll text
 * in appointment descriptions (and latest event body format).
 *
 * Run: npm run migrate:google-calendars-rsvp
 * Re-run: npm run migrate:google-calendars-rsvp -- --force
 */

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { loadServiceAccount } = require("./load-service-account.cjs");
const { ensureGoogleOAuthClientSecret } = require("./ensure-google-oauth-secret.cjs");
const { refreshAllConnectedGoogleCalendarsForRsvpOnce } = require("../functions/lib/sync");

const force = process.argv.includes("--force");

ensureGoogleOAuthClientSecret();

if (!getApps().length) {
  initializeApp({ credential: cert(loadServiceAccount()) });
}

const db = getFirestore();

refreshAllConnectedGoogleCalendarsForRsvpOnce(db, { force })
  .then((result) => {
    if (result.skipped) {
      console.log("RSVP calendar migration already completed — use --force to run again.");
      process.exit(0);
    }
    console.log(
      `Done. ${result.users} connected user(s), ${result.events} mapped event(s) refreshed.`
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
