import type { User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  FOUNDER_BOOTSTRAP_EMAIL,
  FOUNDER_BOOTSTRAP_NAME,
  normalizeOrgRole,
  type OrgRole,
} from "../auth/roles";
import { normalizeDepartments } from "../types";
import { getFirestoreDb, SIMASIA_AI_ORG_ID } from "./config";
import { normalizeRegistrationSeed } from "./registrationSeeds";
import { verifyUserOrgAccess } from "./userAccess";

const ORG = SIMASIA_AI_ORG_ID;

/** Legacy demo ids from old seed data — never auto-provision or show as team members. */
export const LEGACY_SEED_PERSON_IDS = new Set(["p1", "p2", "p3", "p4"]);

async function resolveOrgRoleForEnsure(
  prev: Record<string, unknown>,
  emailLower: string
): Promise<OrgRole | undefined> {
  if (emailLower === FOUNDER_BOOTSTRAP_EMAIL) return "founder";

  const seedId = String(prev.registrationSeedId ?? "").trim();
  if (seedId) {
    const db = getFirestoreDb();
    const seedSnap = await getDoc(doc(db, "organizations", ORG, "registrationSeeds", seedId));
    if (seedSnap.exists()) {
      const seed = normalizeRegistrationSeed(seedSnap.id, seedSnap.data() as Record<string, unknown>);
      return seed.orgRole;
    }
  }

  if (prev.orgRole != null && String(prev.orgRole).trim() !== "") {
    return normalizeOrgRole(prev.orgRole);
  }

  return undefined;
}

/**
 * Verifies org access, then syncs `users/{uid}` and `organizations/.../people/{uid}`.
 * Never creates a new team profile for unknown accounts (registration seed required).
 */
export async function ensureUserProfile(user: User): Promise<void> {
  await verifyUserOrgAccess(user);

  const db = getFirestoreDb();
  const uid = user.uid;
  const email = (user.email ?? "").trim();
  const emailLower = email.toLowerCase();
  const displayName = (user.displayName || email.split("@")[0] || "Member").trim();

  const personRef = doc(db, "organizations", ORG, "people", uid);
  const existing = await getDoc(personRef);
  const prev = existing.exists() ? (existing.data() as Record<string, unknown>) : {};
  const isFounderBootstrap = emailLower === FOUNDER_BOOTSTRAP_EMAIL;

  if (!existing.exists() && !isFounderBootstrap) {
    throw new Error(
      "This account is not registered with your team. Create an account with a valid one-time seed, or contact your admin."
    );
  }

  const orgRole = await resolveOrgRoleForEnsure(prev, emailLower);
  const departments = normalizeDepartments(prev.departments, prev.department);
  const defaultDepts =
    orgRole === "founder"
      ? departments
      : departments.length > 0
        ? departments
        : ["General"];

  const name =
    String(prev.name ?? "").trim() ||
    (isFounderBootstrap ? FOUNDER_BOOTSTRAP_NAME : displayName);

  const userRow: Record<string, unknown> = {
    email,
    displayName: name,
    orgId: ORG,
    updatedAt: new Date().toISOString(),
  };
  if (orgRole) userRow.orgRole = orgRole;
  if (prev.registrationSeedId) userRow.registrationSeedId = prev.registrationSeedId;
  if (prev.accountExpiresAt) userRow.accountExpiresAt = prev.accountExpiresAt;

  await setDoc(doc(db, "users", uid), userRow, { merge: true });

  const personRow: Record<string, unknown> = {
    id: uid,
    authUid: uid,
    email: email || String(prev.email ?? ""),
    name,
    title: String(prev.title ?? prev.role ?? "").trim(),
    departments: defaultDepts,
  };
  if (orgRole) personRow.orgRole = orgRole;
  if (prev.registrationSeedId) personRow.registrationSeedId = prev.registrationSeedId;
  if (prev.registeredAt) personRow.registeredAt = prev.registeredAt;
  if (prev.profileSetupComplete === false) personRow.profileSetupComplete = false;
  if (prev.accountExpiresAt) personRow.accountExpiresAt = prev.accountExpiresAt;

  await setDoc(personRef, personRow, { merge: true });
}
