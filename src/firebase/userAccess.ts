import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FOUNDER_BOOTSTRAP_EMAIL, normalizeOrgRole } from "../auth/roles";
import { ACCOUNT_EXPIRED_MESSAGE, isAccountExpired } from "../utils/accountExpiry";
import { getFirestoreDb, SIMASIA_AI_ORG_ID } from "./config";

const ORG = SIMASIA_AI_ORG_ID;

function trimStr(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Ensures the signed-in Auth user is allowed into the org workspace.
 * Blocks orphan Auth accounts and sign-in without a completed registration / bootstrap profile.
 */
export async function verifyUserOrgAccess(user: User): Promise<void> {
  const uid = user.uid;
  const emailLower = trimStr(user.email).toLowerCase();

  if (emailLower === FOUNDER_BOOTSTRAP_EMAIL) return;

  const db = getFirestoreDb();
  const personRef = doc(db, "organizations", ORG, "people", uid);
  const userRef = doc(db, "users", uid);
  const [personSnap, userSnap] = await Promise.all([getDoc(personRef), getDoc(userRef)]);

  const person = personSnap.exists() ? (personSnap.data() as Record<string, unknown>) : null;
  const userRow = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : null;

  const orgRole = normalizeOrgRole(person?.orgRole ?? userRow?.orgRole);
  const accountExpiresAt = trimStr(person?.accountExpiresAt) || trimStr(userRow?.accountExpiresAt);
  if (isAccountExpired({ orgRole, accountExpiresAt })) {
    throw new Error(ACCOUNT_EXPIRED_MESSAGE);
  }

  const seedId = trimStr(person?.registrationSeedId) || trimStr(userRow?.registrationSeedId);
  if (seedId) return;

  const personLinked = personSnap.exists() && trimStr(person?.authUid) === uid;
  if (personLinked && (orgRole === "founder" || orgRole === "partner")) return;

  throw new Error(
    "This account is not registered with your team. Create an account with a valid one-time seed, or contact your admin."
  );
}
