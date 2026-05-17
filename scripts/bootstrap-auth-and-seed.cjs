/**
 * Creates a Firebase Auth user (email/password) + matching people doc, then seeds Firestore.
 *
 * Set env (do not commit passwords):
 *   BOOTSTRAP_EMAIL
 *   BOOTSTRAP_PASSWORD
 *   BOOTSTRAP_DISPLAY_NAME (optional)
 *
 * Run from crm/:
 *   node --env-file=.env scripts/bootstrap-auth-and-seed.cjs
 *
 * Or: npm run bootstrap:user
 */

const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initAdmin, seedFirestore, ORG_ID } = require("./seed-firestore.cjs");

async function main() {
  const email = process.env.BOOTSTRAP_EMAIL;
  const password = process.env.BOOTSTRAP_PASSWORD;
  const displayName = process.env.BOOTSTRAP_DISPLAY_NAME || "User";

  if (!email || !password) {
    console.error("Set BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD (e.g. in the shell before running).");
    process.exit(1);
  }

  initAdmin();
  const auth = getAuth();
  const db = getFirestore();
  const orgRef = db.collection("organizations").doc(ORG_ID);

  let uid;
  try {
    const rec = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });
    uid = rec.uid;
    console.log("Created Auth user:", email, "uid:", uid);
  } catch (e) {
    if (e.code === "auth/email-already-exists" || e.code === "auth/email-already-in-use") {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      console.log("Auth user already exists:", email, "uid:", uid);
    } else {
      throw e;
    }
  }

  const emailLower = email.trim().toLowerCase();
  const isFounder = emailLower === "giannismparous@gmail.com";
  const orgRole = isFounder ? "founder" : "member";

  await orgRef
    .collection("people")
    .doc(uid)
    .set(
      {
        id: uid,
        name: isFounder ? "Giannis Mparous" : displayName,
        email,
        title: isFounder ? "Founder" : "",
        orgRole,
        departments: ["General"],
        authUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  console.log("Wrote organizations/" + ORG_ID + "/people/" + uid);

  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        email,
        displayName: isFounder ? "Giannis Mparous" : displayName,
        orgId: ORG_ID,
        orgRole,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  console.log("Wrote users/" + uid);

  const welcomeId = "t_welcome_" + uid.slice(0, 8);
  const today = new Date().toISOString().slice(0, 10);
  await orgRef.collection("tasks").doc(welcomeId).set(
    {
      id: welcomeId,
      title: "Welcome — explore the Simasia CRM workspace",
      description:
        "You’re set up in Firebase. Browse tasks and sales contacts under organizations/SimasiaAI. This task is assigned to you.",
      assigneeIds: [uid],
      assigneeId: uid,
      assignedById: uid,
      status: "todo",
      priority: "medium",
      sector: "general",
      dueDate: today,
      originalDueDate: today,
      postponeCount: 0,
      needsFeedback: false,
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log("Added welcome task:", welcomeId);

  await seedFirestore();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
