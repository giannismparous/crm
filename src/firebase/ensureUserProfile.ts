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
import { verifyUserOrgAccess } from "./userAccess";

const ORG = SIMASIA_AI_ORG_ID;

/** Legacy demo ids from old seed data — never auto-provision or show as team members. */
export const LEGACY_SEED_PERSON_IDS = new Set(["p1", "p2", "p3", "p4"]);

function resolveOrgRoleForEnsure(
  prev: Record<string, unknown>,
  emailLower: string
): OrgRole | undefined {
  if (emailLower === FOUNDER_BOOTSTRAP_EMAIL) return "founder";
  if (prev.orgRole != null && String(prev.orgRole).trim() !== "") {
    return normalizeOrgRole(prev.orgRole);
  }
  if (prev.registrationSeedId) return normalizeOrgRole(prev.orgRole);
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

  const departments = normalizeDepartments(prev.departments, prev.department);
  const defaultDepts = departments.length > 0 ? departments : ["General"];
  const orgRole = resolveOrgRoleForEnsure(prev, emailLower);

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
