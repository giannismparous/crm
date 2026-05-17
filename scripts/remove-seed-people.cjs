/**
 * Deletes legacy demo people (p1–p4) from Firestore.
 * Run: npm run cleanup:seed-people
 */

const { getFirestore } = require("firebase-admin/firestore");
const { initAdmin, ORG_ID } = require("./seed-firestore.cjs");

const LEGACY_IDS = ["p1", "p2", "p3", "p4"];

async function main() {
  initAdmin();
  const db = getFirestore();
  const orgRef = db.collection("organizations").doc(ORG_ID);

  for (const id of LEGACY_IDS) {
    const ref = orgRef.collection("people").doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      console.log("Deleted organizations/" + ORG_ID + "/people/" + id);
    } else {
      console.log("Skip (not found):", id);
    }
  }

  console.log("Done. Refresh the app — Team should list registered users only.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
