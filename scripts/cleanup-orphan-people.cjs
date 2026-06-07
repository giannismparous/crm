/**
 * Removes Firestore team profiles whose Auth user no longer exists.
 * Team tab reads organizations/SimasiaAI/people — deleting Auth alone leaves ghost rows.
 *
 * Run: npm run cleanup:orphan-people
 */

const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { initAdmin, ORG_ID } = require("./seed-firestore.cjs");

async function listAuthUids() {
  const auth = getAuth();
  const uids = new Set();
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const user of res.users) uids.add(user.uid);
    pageToken = res.pageToken;
  } while (pageToken);
  return uids;
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const authUids = await listAuthUids();
  const peopleSnap = await db.collection("organizations").doc(ORG_ID).collection("people").get();

  let deleted = 0;
  for (const doc of peopleSnap.docs) {
    const data = doc.data();
    const authUid = typeof data.authUid === "string" ? data.authUid : doc.id;
    if (authUids.has(authUid)) continue;
    await doc.ref.delete();
    const usersRef = db.collection("users").doc(authUid);
    const usersSnap = await usersRef.get();
    if (usersSnap.exists) await usersRef.delete();
    console.log("Deleted orphan profile:", doc.id, data.email || "");
    deleted++;
  }

  console.log(
    deleted === 0
      ? "No orphan people docs — Team matches Firebase Auth."
      : `Done. Removed ${deleted} orphan profile(s). Refresh Team.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
