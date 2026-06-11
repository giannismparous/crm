import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { normalizeOrgRole, type OrgRole } from "../auth/roles";
import {
  normalizeDepartments,
  normalizeSeedDepartments,
  type CreateRegistrationSeedInput,
  type RegistrationSeed,
} from "../types";
import { loadLocale } from "../i18n/localeStorage";
import { translate } from "../i18n/translate";
import {
  accountExpiresAtFromMonths,
  clampSeedValidDays,
  isSeedExpired,
  normalizePartnerAccountMonths,
  seedExpiresAtIso,
} from "../utils/accountExpiry";
import { validateRegistrationSeedCode } from "./authValidation";
import { SIMASIA_AI_ORG_ID } from "./config";
import { toIso } from "./normalizeFirestore";

const ORG = SIMASIA_AI_ORG_ID;

export function generateSeedCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeRegistrationSeed(
  id: string,
  data: Record<string, unknown>
): RegistrationSeed {
  const orgRole = normalizeOrgRole(data.orgRole);
  const issuedAt = toIso(data.issuedAt) || new Date().toISOString();
  const validDays = clampSeedValidDays(Number(data.validDays) || 7);
  const expiresAt =
    toIso(data.expiresAt) ||
    seedExpiresAtIso(issuedAt, validDays);
  const accountValidMonths =
    orgRole === "partner" && data.accountValidMonths != null
      ? normalizePartnerAccountMonths(data.accountValidMonths)
      : undefined;

  return {
    id,
    orgRole,
    departments:
      orgRole === "founder"
        ? normalizeDepartments(data.departments)
        : normalizeSeedDepartments(
            normalizeDepartments(data.departments, data.department),
            { requireAtLeastOne: true }
          ),
    issuedById: String(data.issuedById ?? ""),
    issuedByEmail: String(data.issuedByEmail ?? ""),
    issuedAt,
    validDays,
    expiresAt,
    accountValidMonths,
    used: Boolean(data.used),
    usedById: data.usedById != null ? String(data.usedById) : undefined,
    usedByEmail: data.usedByEmail != null ? String(data.usedByEmail) : undefined,
    usedAt: data.usedAt != null ? String(data.usedAt) : undefined,
  };
}

function authMsg(key: string): string {
  return translate(loadLocale(), key);
}

function assertSeedUsable(seed: RegistrationSeed): void {
  if (seed.used) throw new Error(authMsg("auth.error.seedUsed"));
  if (isSeedExpired(seed)) throw new Error(authMsg("auth.error.seedExpired"));
}

function isPermissionDenied(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  if (code === "permission-denied") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /permission/i.test(msg);
}

/** Validates a seed before sign-up; throws short, user-facing errors. */
export async function assertRegistrationSeedAvailable(
  db: Firestore,
  code: string
): Promise<RegistrationSeed> {
  const trimmed = validateRegistrationSeedCode(code);

  let snap;
  try {
    snap = await getDoc(doc(db, "organizations", ORG, "registrationSeeds", trimmed));
  } catch (e) {
    if (isPermissionDenied(e)) {
      throw new Error(authMsg("auth.error.seedVerifyFailed"));
    }
    throw e;
  }

  if (!snap.exists()) throw new Error(authMsg("auth.error.seedInvalid"));
  const seed = normalizeRegistrationSeed(snap.id, snap.data() as Record<string, unknown>);
  assertSeedUsable(seed);
  return seed;
}

export async function createRegistrationSeed(
  db: Firestore,
  issuer: { id: string; email: string },
  input: CreateRegistrationSeedInput
): Promise<RegistrationSeed> {
  const orgRole = normalizeOrgRole(input.orgRole);
  const { departments } = input;
  const depts =
    orgRole === "founder" ? [] : normalizeSeedDepartments(departments, { requireAtLeastOne: true });
  const validDays = clampSeedValidDays(input.validDays);
  const accountValidMonths =
    orgRole === "partner" ? normalizePartnerAccountMonths(input.accountValidMonths) : undefined;
  const code = generateSeedCode();
  const now = new Date().toISOString();
  const expiresAt = seedExpiresAtIso(now, validDays);
  const seed: RegistrationSeed = {
    id: code,
    orgRole,
    departments: depts,
    issuedById: issuer.id,
    issuedByEmail: issuer.email,
    issuedAt: now,
    validDays,
    expiresAt,
    accountValidMonths,
    used: false,
  };
  await setDoc(doc(db, "organizations", ORG, "registrationSeeds", code), {
    orgRole: seed.orgRole,
    departments: seed.departments,
    issuedById: seed.issuedById,
    issuedByEmail: seed.issuedByEmail,
    issuedAt: seed.issuedAt,
    validDays: seed.validDays,
    expiresAt: seed.expiresAt,
    ...(accountValidMonths != null ? { accountValidMonths } : {}),
    used: false,
  });
  return seed;
}

export function subscribeRegistrationSeeds(
  db: Firestore,
  onData: (seeds: RegistrationSeed[]) => void,
  onError?: (message: string) => void
): Unsubscribe {
  const q = query(
    collection(db, "organizations", ORG, "registrationSeeds"),
    orderBy("issuedAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) =>
        normalizeRegistrationSeed(d.id, d.data() as Record<string, unknown>)
      );
      onData(list);
    },
    (e) => onError?.(e.message)
  );
}

/** Mark seed used and write org profile after Auth account exists. */
export async function consumeRegistrationSeed(
  db: Firestore,
  user: User,
  seedCode: string
): Promise<OrgRole> {
  const code = validateRegistrationSeedCode(seedCode);

  const seedRef = doc(db, "organizations", ORG, "registrationSeeds", code);
  const personRef = doc(db, "organizations", ORG, "people", user.uid);
  const userRef = doc(db, "users", user.uid);
  const email = (user.email ?? "").trim();
  const displayName = (user.displayName || email.split("@")[0] || "Member").trim();
  const now = new Date().toISOString();

  return runTransaction(db, async (tx) => {
    const seedSnap = await tx.get(seedRef);
    if (!seedSnap.exists()) throw new Error(authMsg("auth.error.seedInvalid"));
    const seed = normalizeRegistrationSeed(seedSnap.id, seedSnap.data() as Record<string, unknown>);
    assertSeedUsable(seed);
    if (seed.usedById && seed.usedById !== user.uid) throw new Error(authMsg("auth.error.seedUsed"));

    const existingPerson = await tx.get(personRef);
    if (existingPerson.exists()) {
      const prev = existingPerson.data() as Record<string, unknown>;
      const prevSeed = String(prev.registrationSeedId ?? "").trim();
      if (prevSeed && prevSeed !== code) {
        throw new Error(authMsg("auth.error.seedWrongAccount"));
      }
    }

    const accountExpiresAt =
      seed.orgRole === "partner" && seed.accountValidMonths
        ? accountExpiresAtFromMonths(now, seed.accountValidMonths)
        : undefined;

    tx.update(seedRef, {
      used: true,
      usedById: user.uid,
      usedByEmail: email,
      usedAt: now,
    });

    const personRow: Record<string, unknown> = {
      id: user.uid,
      authUid: user.uid,
      email,
      name: displayName,
      title: "",
      departments: seed.departments,
      orgRole: seed.orgRole,
      registrationSeedId: code,
      registeredAt: now,
      profileSetupComplete: false,
    };
    if (accountExpiresAt) personRow.accountExpiresAt = accountExpiresAt;

    if (existingPerson.exists()) {
      tx.set(personRef, personRow, { merge: true });
    } else {
      tx.set(personRef, personRow);
    }

    const userRow: Record<string, unknown> = {
      email,
      displayName,
      orgId: ORG,
      orgRole: seed.orgRole,
      registrationSeedId: code,
      updatedAt: now,
    };
    if (accountExpiresAt) userRow.accountExpiresAt = accountExpiresAt;

    if (existingPerson.exists()) {
      tx.set(userRef, userRow, { merge: true });
    } else {
      tx.set(userRef, userRow);
    }

    return seed.orgRole;
  });
}
