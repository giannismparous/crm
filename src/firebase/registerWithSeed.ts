import { createUserWithEmailAndPassword, deleteUser, type UserCredential } from "firebase/auth";
import { createT } from "../i18n/helpers";
import { loadLocale } from "../i18n/localeStorage";
import { translate } from "../i18n/translate";
import { formatAuthError } from "./authErrors";
import { validateRegistrationCredentials } from "./authValidation";
import { getFirebaseAuth, getFirestoreDb, signOutUser } from "./config";
import { ensureUserProfile } from "./ensureUserProfile";
import { markUserProfileSynchronized } from "./profileSync";
import { assertRegistrationSeedAvailable, consumeRegistrationSeed } from "./registrationSeeds";

let registrationInFlight = false;

const SEED_SETUP_ERROR_KEYS = [
  "auth.error.seedUsed",
  "auth.error.seedInvalid",
  "auth.error.seedExpired",
  "auth.error.seedVerifyFailed",
  "auth.error.seedWrongAccount",
  "auth.validation.seedRequired",
  "auth.validation.seedInvalid",
] as const;

function isSeedSetupError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const locale = loadLocale();
  return SEED_SETUP_ERROR_KEYS.some((key) => translate(locale, key) === err.message);
}

/**
 * Register with email/password using a one-time seed.
 * Rolls back the Auth user if Firestore setup fails so no orphan accounts remain.
 */
export async function registerWithSeed(
  email: string,
  password: string,
  seedCode: string
): Promise<UserCredential> {
  const t = createT(loadLocale());

  if (registrationInFlight) {
    throw new Error(t("auth.error.registrationInProgress"));
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
      await ensureUserProfile(cred.user);
      markUserProfileSynchronized(cred.user.uid);
    } catch (setupErr) {
      try {
        await deleteUser(cred.user);
      } catch {
        await signOutUser();
      }
      if (isSeedSetupError(setupErr)) {
        throw setupErr instanceof Error ? setupErr : new Error(t("auth.error.registrationFailed"));
      }
      throw new Error(t("auth.error.registrationIncomplete"));
    }
    return cred;
  } catch (err) {
    throw new Error(formatAuthError(err, t));
  } finally {
    registrationInFlight = false;
  }
}
