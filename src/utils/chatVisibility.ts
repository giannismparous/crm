import { canSeeAllOrgData, type OrgRole } from "../auth/roles";
import type { Person } from "../types";
import { personVisibleToViewer } from "./orgVisibility";

/** People the viewer may start a DM or group chat with */
export function peopleMessageableByViewer(
  people: Person[],
  viewer: Person | undefined,
  viewerId: string,
  role: OrgRole
): Person[] {
  return people.filter(
    (p) => p.id && p.id !== viewerId && personVisibleToViewer(p, viewer, role)
  );
}

export function canMessagePerson(
  person: Person,
  viewer: Person | undefined,
  viewerId: string,
  role: OrgRole
): boolean {
  if (!person.id || person.id === viewerId) return false;
  return personVisibleToViewer(person, viewer, role);
}

export function isFounderRole(role: OrgRole): boolean {
  return canSeeAllOrgData(role);
}
