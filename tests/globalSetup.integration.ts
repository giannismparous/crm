import { isFirestoreEmulatorUp } from "./helpers/emulatorAvailable";

export default async function globalSetup(): Promise<void> {
  const up = await isFirestoreEmulatorUp();
  process.env.VITEST_EMULATOR_UP = up ? "1" : "0";
  const strict = process.env.CRM_TEST_STRICT === "1";
  const allowSkip = process.env.CRM_TEST_ALLOW_SKIP === "1";
  if (!up && strict) {
    throw new Error(
      "Firebase emulators not reachable. Install Java 11+ and run npm run test:integration."
    );
  }
  if (!up && !allowSkip) {
    throw new Error(
      "Firebase emulators not reachable. Use npm run test:integration:optional to skip locally."
    );
  }
  if (!up && allowSkip) {
    console.warn("\n[integration] Emulator not up — tests will be skipped (optional mode).\n");
  }
}
