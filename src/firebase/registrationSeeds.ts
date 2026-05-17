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
import type { RegistrationSeed } from "../types";
import { SIMASIA_AI_ORG_ID } from "./config";

const ORG = SIMASIA_AI_ORG_ID;

export function generateSeedCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeRegistrationSeed(
  id: string,
  data: Record<string, unknown>
): RegistrationSeed {
  return {
    id,
    orgRole: normalizeOrgRole(data.orgRole),
    issuedById: String(data.issuedById ?? ""),
    issuedByEmail: String(data.issuedByEmail ?? ""),
    issuedAt: String(data.issuedAt ?? ""),
    used: Boolean(data.used),
    usedById: data.usedById != null ? String(data.usedById) : undefined,
    usedByEmail: data.usedByEmail != null ? String(data.usedByEmail) : undefined,
    usedAt: data.usedAt != null ? String(data.usedAt) : undefined,
  };
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
  const trimmed = code.trim().toLowerCase();
  if (!trimmed) throw new Error("Enter a registration seed.");

  let snap;
  try {
    snap = await getDoc(doc(db, "organizations", ORG, "registrationSeeds", trimmed));
  } catch (e) {
    if (isPermissionDenied(e)) {
      throw new Error("Could not verify seed. Check the code or ask for a new one.");
    }
    throw e;
  }

  if (!snap.exists()) throw new Error("Invalid seed.");
  const seed = normalizeRegistrationSeed(snap.id, snap.data() as Record<string, unknown>);
  if (seed.used) throw new Error("Seed already used.");
  return seed;
}

export async function createRegistrationSeed(
  db: Firestore,
  issuer: { id: string; email: string },
  orgRole: OrgRole
): Promise<RegistrationSeed> {
  const code = generateSeedCode();
  const now = new Date().toISOString();
  const seed: RegistrationSeed = {
    id: code,
    orgRole,
    issuedById: issuer.id,
    issuedByEmail: issuer.email,
    issuedAt: now,
    used: false,
  };
  await setDoc(doc(db, "organizations", ORG, "registrationSeeds", code), {
    orgRole: seed.orgRole,
    issuedById: seed.issuedById,
    issuedByEmail: seed.issuedByEmail,
    issuedAt: seed.issuedAt,
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
  const code = seedCode.trim().toLowerCase();
  if (!code) throw new Error("Registration seed is required.");

  const seedRef = doc(db, "organizations", ORG, "registrationSeeds", code);
  const personRef = doc(db, "organizations", ORG, "people", user.uid);
  const userRef = doc(db, "users", user.uid);
  const email = (user.email ?? "").trim();
  const displayName = (user.displayName || email.split("@")[0] || "Member").trim();
  const now = new Date().toISOString();

  return runTransaction(db, async (tx) => {
    const seedSnap = await tx.get(seedRef);
    if (!seedSnap.exists()) throw new Error("Invalid seed.");
    const seed = normalizeRegistrationSeed(seedSnap.id, seedSnap.data() as Record<string, unknown>);
    if (seed.used) throw new Error("Seed already used.");

    tx.update(seedRef, {
      used: true,
      usedById: user.uid,
      usedByEmail: email,
      usedAt: now,
    });

    tx.set(
      personRef,
      {
        id: user.uid,
        authUid: user.uid,
        email,
        name: displayName,
        title: "",
        departments: ["General"],
        orgRole: seed.orgRole,
        registrationSeedId: code,
        registeredAt: now,
      },
      { merge: true }
    );

    tx.set(
      userRef,
      {
        email,
        displayName,
        orgId: ORG,
        orgRole: seed.orgRole,
        registrationSeedId: code,
        updatedAt: now,
      },
      { merge: true }
    );

    return seed.orgRole;
  });
}
