import { initializeApp, getApps, deleteApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const EMULATOR_PROJECT = "crm-integration-test";
export const ORG = "SimasiaAI";

let app: App | undefined;

export function getAdminApp(): App {
  if (!app) {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
    const existing = getApps().find((a) => a.name === "integration");
    app =
      existing ??
      initializeApp(
        {
          projectId: EMULATOR_PROJECT,
        },
        "integration"
      );
  }
  return app;
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export async function resetEmulatorData(): Promise<void> {
  const db = adminDb();
  const orgRef = db.collection("organizations").doc(ORG);
  const subs = ["people", "tasks", "projects", "appointments", "personalReminders", "notifications", "contacts", "chatConversations", "registrationSeeds"];
  for (const sub of subs) {
    const snap = await orgRef.collection(sub).get();
    const batch = db.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    if (!snap.empty) await batch.commit();
  }
  const users = await db.collection("users").get();
  const ub = db.batch();
  for (const d of users.docs) ub.delete(d.ref);
  if (!users.empty) await ub.commit();
}

export async function createAuthUser(uid: string, email: string): Promise<void> {
  const auth = adminAuth();
  try {
    await auth.createUser({ uid, email, password: "test-pass-123" });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "auth/uid-already-exists") throw err;
  }
}

export async function seedPersonDoc(
  uid: string,
  data: Record<string, unknown>
): Promise<void> {
  await adminDb()
    .doc(`organizations/${ORG}/people/${uid}`)
    .set({ id: uid, authUid: uid, ...data });
}

export async function createRegistrationSeed(seedId: string, data: Record<string, unknown>) {
  await adminDb().doc(`organizations/${ORG}/registrationSeeds/${seedId}`).set(data);
}

export { FieldValue };

export async function teardownAdminApp(): Promise<void> {
  if (app) {
    await deleteApp(app);
    app = undefined;
  }
}
