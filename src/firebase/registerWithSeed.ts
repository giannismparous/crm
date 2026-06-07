import { createUserWithEmailAndPassword, deleteUser, type UserCredential } from "firebase/auth";
import { formatAuthError } from "./authErrors";
import { validateRegistrationCredentials } from "./authValidation";
import { getFirebaseAuth, getFirestoreDb, signOutUser } from "./config";
import { assertRegistrationSeedAvailable, consumeRegistrationSeed } from "./registrationSeeds";

let registrationInFlight = false;

/**
 * Register with email/password using a one-time seed.
 * Rolls back the Auth user if Firestore setup fails so no orphan accounts remain.
 */
export async function registerWithSeed(
  email: string,
  password: string,
  seedCode: string
): Promise<UserCredential> {
  if (registrationInFlight) {
    throw new Error("Registration already in progress. Please wait.");
  }

  const creds = validateRegistrationCredentials(email, password, seedCode);
  const db = getFirestoreDb();
  const auth = getFirebaseAuth();

  registrationInFlight = true;
  try {
    await assertRegistrationSeedAvailable(db, creds.seedCode);

    const cred = await createUserWithEmailAndPassword(auth, creds.email, creds.password);
    try {
      await consumeRegistrationSeed(db, cred.user, creds.seedCode);
    } catch (setupErr) {
      try {
        await deleteUser(cred.user);
      } catch {
        await signOutUser();
      }
      const msg = setupErr instanceof Error ? setupErr.message : "Registration failed.";
      if (/seed already used/i.test(msg) || /invalid seed/i.test(msg) || /expired seed/i.test(msg)) {
        throw new Error(msg);
      }
      throw new Error("Registration could not be completed. Ask your admin for a new seed and try again.");
    }
    return cred;
  } catch (err) {
    throw new Error(formatAuthError(err));
  } finally {
    registrationInFlight = false;
  }
}
