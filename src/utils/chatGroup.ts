import type { Person } from "../types";
import { normalizeAssigneeDepartments, personInDepartment } from "./taskAssignees";

/** Stable key from explicit people + department picks (not expanded membership). */
export function groupKeyForSelection(
  participantIds: string[],
  departmentIds: string[],
  creatorId: string
): string {
  const people = [...new Set(participantIds.filter((id) => id && id !== creatorId))].sort();
  const depts = normalizeAssigneeDepartments(departmentIds).sort();
  return `p:${people.join(",")}|d:${depts.join(",")}`;
}

/** Expand selected people and departments into unique chat member ids (includes creator). */
export function resolveGroupMemberIds(
  creatorId: string,
  participantIds: string[],
  departmentIds: string[],
  people: Person[]
): string[] {
  const ids = new Set<string>();
  if (creatorId) ids.add(creatorId);
  for (const id of participantIds) {
    if (id) ids.add(id);
  }
  for (const dept of normalizeAssigneeDepartments(departmentIds)) {
    for (const person of people) {
      if (person.id && personInDepartment(person, dept)) ids.add(person.id);
    }
  }
  return [...ids].sort();
}

export function groupDepartmentsFromPeople(people: Person[], allowedIds: Set<string>): string[] {
  const depts = new Set<string>();
  for (const person of people) {
    if (!allowedIds.has(person.id)) continue;
    for (const dept of person.departments) depts.add(dept);
  }
  return [...depts].sort();
}
