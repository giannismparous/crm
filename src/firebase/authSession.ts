import type { UserCredential } from "firebase/auth";
import { signInWithEmail, signOutUser } from "./config";
import { formatAuthError } from "./authErrors";
import { validateSignInCredentials } from "./authValidation";
import { ensureUserProfile } from "./ensureUserProfile";

/** Sign in and verify the account is registered before entering the app. */
export async function signInWithTeamAccess(email: string, password: string): Promise<UserCredential> {
  const creds = validateSignInCredentials(email, password);
  try {
    const result = await signInWithEmail(creds.email, creds.password);
    try {
      await ensureUserProfile(result.user);
    } catch (profileErr) {
      await signOutUser();
      throw profileErr;
    }
    return result;
  } catch (err) {
    throw new Error(formatAuthError(err));
  }
}
