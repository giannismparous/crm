/**
 * Apply storage.cors.json to the Firebase Storage bucket (required for
 * getBytes / re-cropping profile photos from the web app on localhost).
 *
 * Run: npm run storage:cors
 * Requires: FIREBASE_SERVICE_ACCOUNT_PATH or serviceAccount.json in project root
 */

const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");

const CRM_ROOT = resolve(__dirname, "..");

function loadServiceAccount() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  const candidates = [
    fromEnv ? resolve(fromEnv) : null,
    resolve(CRM_ROOT, "serviceAccount.json"),
  ].filter(Boolean);
  for (const path of candidates) {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  }
  throw new Error(
    "Missing Admin SDK credentials. Set FIREBASE_SERVICE_ACCOUNT_PATH in .env or add serviceAccount.json to the project root."
  );
}

function loadBucketName() {
  const fromEnv = process.env.VITE_FIREBASE_STORAGE_BUCKET?.trim();
  if (fromEnv) return fromEnv;
  const envPath = resolve(CRM_ROOT, ".env");
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, "utf8").match(/^VITE_FIREBASE_STORAGE_BUCKET=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  }
  throw new Error("Missing VITE_FIREBASE_STORAGE_BUCKET in .env");
}

async function main() {
  if (!getApps().length) {
    initializeApp({ credential: cert(loadServiceAccount()) });
  }
  const bucketName = loadBucketName();
  const corsPath = resolve(CRM_ROOT, "storage.cors.json");
  const cors = JSON.parse(readFileSync(corsPath, "utf8"));
  const bucket = getStorage().bucket(bucketName);
  await bucket.setMetadata({ cors });
  console.log(`Storage CORS updated for gs://${bucketName}`);
  console.log("Origins:", cors[0]?.origin?.join(", ") ?? "(none)");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
