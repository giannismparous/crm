import { createUserWithEmailAndPassword, type UserCredential } from "firebase/auth";
import { getFirebaseAuth, getFirestoreDb } from "./config";
import { assertRegistrationSeedAvailable, consumeRegistrationSeed } from "./registrationSeeds";

/**
 * Register with email/password using a one-time seed.
 * Validates the seed before creating the Auth user, then marks it used in a transaction.
 */
export async function registerWithSeed(
  email: string,
  password: string,
  seedCode: string
): Promise<UserCredential> {
  const trimmedEmail = email.trim();
  const code = seedCode.trim().toLowerCase();
  if (!code) throw new Error("Enter a registration seed.");

  const db = getFirestoreDb();
  await assertRegistrationSeedAvailable(db, code);

  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), trimmedEmail, password);
  try {
    await consumeRegistrationSeed(db, cred.user, code);
    const { ensureUserProfile } = await import("./ensureUserProfile");
    await ensureUserProfile(cred.user);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Registration failed.";
    if (/seed already used/i.test(msg) || /invalid seed/i.test(msg)) {
      throw new Error(msg);
    }
    throw new Error("Account created but setup failed. Try signing in, or ask for a new seed.");
  }
  return cred;
}
