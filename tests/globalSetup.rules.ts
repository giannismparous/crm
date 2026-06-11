import { isFirestoreEmulatorUp } from "./helpers/emulatorAvailable";

export default async function globalSetup(): Promise<void> {
  const up = await isFirestoreEmulatorUp();
  process.env.VITEST_EMULATOR_UP = up ? "1" : "0";
  const strict = process.env.CRM_TEST_STRICT === "1";
  const allowSkip = process.env.CRM_TEST_ALLOW_SKIP === "1";
  if (!up && strict) {
    throw new Error(
      "Firestore emulator not reachable on 127.0.0.1:8080. Install Java 11+ and run npm run test:rules."
    );
  }
  if (!up && !allowSkip) {
    throw new Error(
      "Firestore emulator not reachable. Use npm run test:rules:optional to skip locally, or install Java 11+."
    );
  }
  if (!up && allowSkip) {
    console.warn("\n[rules] Emulator not up — tests will be skipped (optional mode).\n");
  }
}
