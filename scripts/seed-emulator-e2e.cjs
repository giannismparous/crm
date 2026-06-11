#!/usr/bin/env node
/**
 * Seed Auth + Firestore for emulator E2E (run while emulators are up).
 */
const admin = require("firebase-admin");

const ORG = "SimasiaAI";
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "crm-product-3e233";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const USERS = [
  {
    uid: "e2e-founder",
    email: "founder-e2e@test.local",
    password: "test-pass-123",
    name: "E2E Founder",
    orgRole: "founder",
    departments: [],
  },
  {
    uid: "e2e-partner-eng",
    email: "partner-eng-e2e@test.local",
    password: "test-pass-123",
    name: "E2E Eng Partner",
    orgRole: "partner",
    departments: ["Engineering"],
  },
  {
    uid: "e2e-partner-sales",
    email: "partner-sales-e2e@test.local",
    password: "test-pass-123",
    name: "E2E Sales Partner",
    orgRole: "partner",
    departments: ["Sales"],
  },
];

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT });
  }
  const auth = admin.auth();
  const db = admin.firestore();
  const now = new Date().toISOString();

  for (const u of USERS) {
    try {
      await auth.createUser({ uid: u.uid, email: u.email, password: u.password, emailVerified: true });
    } catch (err) {
      if (err.code !== "auth/uid-already-exists") throw err;
    }

    const person = {
      id: u.uid,
      authUid: u.uid,
      name: u.name,
      title: u.orgRole === "founder" ? "Founder" : "Partner",
      email: u.email,
      departments: u.departments,
      orgRole: u.orgRole,
      profileSetupComplete: true,
      registeredAt: now,
    };
    await db.doc(`organizations/${ORG}/people/${u.uid}`).set(person, { merge: true });
    await db.doc(`users/${u.uid}`).set(
      {
        email: u.email,
        displayName: u.name,
        orgId: ORG,
        orgRole: u.orgRole,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  const taskBase = {
    description: "",
    assignedById: "e2e-founder",
    status: "todo",
    priority: "medium",
    dueDate: now,
    originalDueDate: now,
    postponeCount: 0,
    needsFeedback: false,
    createdAt: now,
    finishedByIds: [],
    feedbackByIds: [],
    feedbackRequests: [],
    comments: [],
    updateEntries: [],
    updates: "",
  };

  // Dept-scoped tasks for visibility checks (partners use scoped task listeners)
  await db.doc(`organizations/${ORG}/tasks/e2e-task-eng`).set({
    ...taskBase,
    title: "Engineering task",
    assigneeIds: ["e2e-partner-eng"],
    assigneeDepartmentIds: ["Engineering"],
    assigneeId: "e2e-partner-eng",
  });
  await db.doc(`organizations/${ORG}/tasks/e2e-task-sales`).set({
    ...taskBase,
    title: "Sales task",
    assigneeIds: [],
    assigneeDepartmentIds: ["Sales"],
  });

  console.log("E2E emulator seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
