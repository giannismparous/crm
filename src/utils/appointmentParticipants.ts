import type { Appointment, Person } from "../types";
import { normalizeAssigneeDepartments, normalizeIdList } from "./taskAssignees";
import { recipientIdsFromSelection } from "./notifyRecipients";

/** Person ids already represented by selected departments. */
export function participantIdsCoveredByDepartments(
  people: Person[],
  departmentIds: string[]
): Set<string> {
  const covered = new Set<string>();
  for (const dept of departmentIds) {
    for (const person of people) {
      if (person.departments.includes(dept)) covered.add(person.id);
    }
  }
  return covered;
}

/** Dedupe ids and drop individuals already covered by a selected department. */
export function normalizeAppointmentParticipants(
  people: Person[],
  participantIds: string[],
  participantDepartmentIds: string[]
): { participantIds: string[]; participantDepartmentIds: string[] } {
  const depts = normalizeAssigneeDepartments(participantDepartmentIds);
  const ids = normalizeIdList(participantIds);
  const covered = participantIdsCoveredByDepartments(people, depts);
  return {
    participantIds: ids.filter((id) => !covered.has(id)),
    participantDepartmentIds: depts,
  };
}

/** All unique attendee person ids (direct + department members). */
export function appointmentAttendeeIds(
  apt: Pick<Appointment, "participantIds" | "participantDepartmentIds">,
  people: Person[]
): string[] {
  return recipientIdsFromSelection(
    people,
    apt.participantIds,
    apt.participantDepartmentIds ?? []
  );
}
