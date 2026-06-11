import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

export const RULES_PROJECT_ID = "crm-rules-test";
export const ORG = "SimasiaAI";

let env: RulesTestEnvironment | null = null;

export async function getRulesTestEnv(): Promise<RulesTestEnvironment> {
  if (!env) {
    const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
    env = await initializeTestEnvironment({
      projectId: RULES_PROJECT_ID,
      firestore: { rules, host: "127.0.0.1", port: 8080 },
    });
  }
  return env;
}

export async function clearFirestore(): Promise<void> {
  const testEnv = await getRulesTestEnv();
  await testEnv.clearFirestore();
}

export async function authedDb(uid: string, email?: string) {
  const testEnv = await getRulesTestEnv();
  return testEnv.authenticatedContext(uid, email ? { email } : undefined).firestore();
}

export async function unauthedDb() {
  const testEnv = await getRulesTestEnv();
  return testEnv.unauthenticatedContext().firestore();
}

/** Seed data bypassing security rules (emulator only). */
export async function seedDoc(path: string, data: Record<string, unknown>): Promise<void> {
  const testEnv = await getRulesTestEnv();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}
