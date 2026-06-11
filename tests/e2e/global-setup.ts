import { execSync } from "node:child_process";

export default async function globalSetup(): Promise<void> {
  execSync("node scripts/seed-emulator-e2e.cjs", {
    stdio: "inherit",
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
    },
  });
}
