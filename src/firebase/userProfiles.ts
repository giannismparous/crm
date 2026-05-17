import type { Person } from "../types";
import { personSortKey } from "../types";
import { LEGACY_SEED_PERSON_IDS } from "./ensureUserProfile";

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  department: string;
};

export function normalizeUserProfile(id: string, data: Record<string, unknown>): UserProfile {
  return {
    id,
    email: String(data.email ?? "").trim(),
    displayName: String(data.displayName ?? data.name ?? "").trim(),
    department: String(data.department ?? "").trim(),
  };
}

/** Registered members from org `people/` — must have `authUid` (created on sign-in). */
export function registeredPeopleFromOrg(people: Person[]): Person[] {
  return people
    .filter((p) => !LEGACY_SEED_PERSON_IDS.has(p.id))
    .filter((p) => Boolean(p.authUid))
    .sort((a, b) => personSortKey(a.departments, a.name).localeCompare(personSortKey(b.departments, b.name)));
}
