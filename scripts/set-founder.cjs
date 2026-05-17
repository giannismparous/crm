/**
 * Promotes an existing Auth user to founder (orgRole on people + users docs).
 *
 *   BOOTSTRAP_EMAIL=giannismparous@gmail.com node --env-file=.env scripts/set-founder.cjs
 *
 * Or: npm run set:founder
 */

const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initAdmin, ORG_ID } = require("./seed-firestore.cjs");

const FOUNDER_EMAIL = (process.env.BOOTSTRAP_EMAIL || "giannismparous@gmail.com").trim().toLowerCase();
const FOUNDER_NAME = process.env.BOOTSTRAP_DISPLAY_NAME || "Giannis Mparous";

async function main() {
  initAdmin();
  const auth = getAuth();
  const db = getFirestore();

  let user;
  try {
    user = await auth.getUserByEmail(FOUNDER_EMAIL);
  } catch (e) {
    console.error("No Auth user for", FOUNDER_EMAIL, "- create the account first (bootstrap or register).");
    process.exit(1);
  }

  const uid = user.uid;
  const orgRef = db.collection("organizations").doc(ORG_ID);

  await orgRef.collection("people").doc(uid).set(
    {
      id: uid,
      authUid: uid,
      email: FOUNDER_EMAIL,
      name: FOUNDER_NAME,
      title: "Founder",
      orgRole: "founder",
      departments: ["General"],
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.collection("users").doc(uid).set(
    {
      email: FOUNDER_EMAIL,
      displayName: FOUNDER_NAME,
      orgId: ORG_ID,
      orgRole: "founder",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Set founder:", FOUNDER_NAME, FOUNDER_EMAIL, "uid:", uid);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
