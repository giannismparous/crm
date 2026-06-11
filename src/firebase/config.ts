import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type UserCredential,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

declare global {
  // eslint-disable-next-line no-var
  var __crmFirebaseEmulatorsConnected: boolean | undefined;
}

/** Tenant id — Firestore path `organizations/{SIMASIA_AI_ORG_ID}` */
export const SIMASIA_AI_ORG_ID = "SimasiaAI";

const required = (key: keyof ImportMetaEnv) => {
  const v = import.meta.env[key];
  if (!v || String(v).trim() === "") {
    throw new Error(`Missing env ${key}. Copy .env.example to .env and add your Firebase web app keys.`);
  }
  return v as string;
};

function readFirebaseConfig(): FirebaseOptions {
  const config: FirebaseOptions = {
    apiKey: required("VITE_FIREBASE_API_KEY"),
    authDomain: required("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: required("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: required("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: required("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: required("VITE_FIREBASE_APP_ID"),
  };
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
  if (measurementId && String(measurementId).trim() !== "") {
    config.measurementId = measurementId;
  }
  return config;
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

function useEmulators(): boolean {
  return String(import.meta.env.VITE_USE_FIREBASE_EMULATORS ?? "").trim() === "1";
}

function ensureFirebaseServices(): void {
  if (!app) app = initializeApp(readFirebaseConfig());
  if (!auth) auth = getAuth(app);
  if (!db) db = getFirestore(app);
  if (!storage) storage = getStorage(app);
  if (useEmulators() && !globalThis.__crmFirebaseEmulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    globalThis.__crmFirebaseEmulatorsConnected = true;
  }
}

export function getFirebaseApp(): FirebaseApp {
  ensureFirebaseServices();
  return app!;
}

export function getFirebaseAuth(): Auth {
  ensureFirebaseServices();
  return auth!;
}

export function getFirestoreDb(): Firestore {
  ensureFirebaseServices();
  return db!;
}

export function getFirebaseStorage(): FirebaseStorage {
  ensureFirebaseServices();
  return storage!;
}

/** Email / password (enable “Email/Password” in Firebase Console → Authentication → Sign-in method) */
export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(getFirebaseAuth(), email, password);
}

export async function signOutUser(): Promise<void> {
  return signOut(getFirebaseAuth());
}

export async function sendPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(getFirebaseAuth(), email);
}

/** Optional Analytics — call from the browser only when you want GA4 (e.g. after login page exists). */
export async function getFirebaseAnalytics() {
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
  if (!measurementId) return null;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return null;
  return getAnalytics(getFirebaseApp());
}
