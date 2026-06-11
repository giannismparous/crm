import { defineConfig } from "@playwright/test";

const e2eEnabled = process.env.CRM_E2E_ENABLED === "1";

const emulatorEnv = {
  VITE_USE_FIREBASE_EMULATORS: "1",
  VITE_FIREBASE_API_KEY: "fake-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "localhost",
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || "crm-product-3e233",
  VITE_FIREBASE_STORAGE_BUCKET: "crm-product-3e233.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789012",
  VITE_FIREBASE_APP_ID: "1:123456789012:web:e2e000000000000",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  globalSetup: e2eEnabled ? "tests/e2e/global-setup.ts" : undefined,
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry",
  },
  webServer: e2eEnabled
    ? {
        command: "npm run build && npm run preview -- --port 4174 --strictPort",
        port: 4174,
        timeout: 180_000,
        reuseExistingServer: false,
        env: { ...process.env, ...emulatorEnv },
      }
    : undefined,
});
