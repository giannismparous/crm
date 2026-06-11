#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { ensureJava11 } from "./require-java.mjs";

ensureJava11();

const env = {
  ...process.env,
  CRM_E2E_ENABLED: "1",
  VITE_USE_FIREBASE_EMULATORS: "1",
  VITE_FIREBASE_API_KEY: "fake-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "localhost",
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || "crm-product-3e233",
  VITE_FIREBASE_STORAGE_BUCKET: "crm-product-3e233.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789012",
  VITE_FIREBASE_APP_ID: "1:123456789012:web:e2e000000000000",
};

const result = spawnSync(
  "firebase",
  ["emulators:exec", "--only", "auth,firestore,storage", "npx playwright test"],
  { stdio: "inherit", env, shell: false }
);

process.exit(result.status ?? 1);
