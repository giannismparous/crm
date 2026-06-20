/**
 * Post-deploy smoke: sign in as giannismparous@gmail.com via custom token,
 * call getGoogleCalendarStatus + syncGoogleCalendarItem (dry upsert on a task if any).
 */
const { initializeApp } = require("firebase/app");
const { getAuth, signInWithCustomToken } = require("firebase/auth");
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require("firebase/functions");
const { getFirestore, collection, query, limit, getDocs } = require("firebase/firestore");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");
const { getFirestore: getAdminFirestore } = require("firebase-admin/firestore");
const { initAdmin } = require("./seed-firestore.cjs");

const FOUNDER_EMAIL = "giannismparous@gmail.com";
const ORG_ID = "SimasiaAI";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

async function main() {
  initAdmin();
  const adminAuth = getAdminAuth();
  const adminDb = getAdminFirestore();

  const user = await adminAuth.getUserByEmail(FOUNDER_EMAIL);
  const customToken = await adminAuth.createCustomToken(user.uid);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await signInWithCustomToken(auth, customToken);
  console.log("Signed in as:", FOUNDER_EMAIL, "uid:", user.uid);

  const functions = getFunctions(app, "us-central1");
  const statusFn = httpsCallable(functions, "getGoogleCalendarStatus");
  const status = await statusFn();
  console.log("getGoogleCalendarStatus:", JSON.stringify(status.data));

  const syncFn = httpsCallable(functions, "syncGoogleCalendarItem");
  const tasksSnap = await getDocs(
    query(collection(getFirestore(app), "organizations", ORG_ID, "tasks"), limit(1))
  );
  if (!tasksSnap.empty) {
    const taskId = tasksSnap.docs[0].id;
    const syncResult = await syncFn({ crmType: "task", crmId: taskId, action: "upsert" });
    console.log("syncGoogleCalendarItem (sample task):", JSON.stringify(syncResult.data));
  } else {
    console.log("No tasks in org — skipped syncGoogleCalendarItem sample");
  }

  const aptSnap = await adminDb.collection(`organizations/${ORG_ID}/appointments`).limit(1).get();
  if (!aptSnap.empty) {
    const aptId = aptSnap.docs[0].id;
    const aptSync = await syncFn({ crmType: "appointment", crmId: aptId, action: "upsert" });
    console.log("syncGoogleCalendarItem (sample appointment):", JSON.stringify(aptSync.data));
  }

  console.log("Smoke OK");
}

main().catch((e) => {
  console.error("Smoke FAILED:", e.message || e);
  process.exit(1);
});
