import type { Appointment, Person } from "../types";
import { formatInOrgTime } from "./orgTimezone";

export function isAppointmentScheduled(apt: Appointment): boolean {
  return apt.status === "scheduled";
}

export function personDisplayName(p: Person): string {
  return p.name.trim() || p.email.trim() || "Unknown";
}

/** True when the person created, is listed, or belongs to an invited department. */
export function isAppointmentRelevantToPerson(
  apt: Appointment,
  personId: string,
  people: Person[]
): boolean {
  if (!personId) return false;
  if (apt.createdById === personId) return true;
  if (apt.participantIds.includes(personId)) return true;
  const depts = apt.participantDepartmentIds ?? [];
  if (depts.length === 0) return false;
  const person = people.find((p) => p.id === personId);
  if (!person) return false;
  return depts.some((d) => person.departments.includes(d));
}

export function appointmentStartsAtMs(apt: Appointment): number {
  const d = new Date(apt.startsAt);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function formatAppointmentTimeRange(apt: Appointment): string {
  const start = new Date(apt.startsAt);
  if (Number.isNaN(start.getTime())) return "";
  const startStr = formatInOrgTime(start, { hour: "numeric", minute: "2-digit" });
  if (!apt.endsAt) return startStr;
  const end = new Date(apt.endsAt);
  if (Number.isNaN(end.getTime())) return startStr;
  const endStr = formatInOrgTime(end, { hour: "numeric", minute: "2-digit" });
  return `${startStr} – ${endStr}`;
}

export function formatAppointmentParticipants(
  apt: Appointment,
  people: Person[],
  currentUserId?: string
): string {
  const ids = apt.participantIds.filter(Boolean);
  const depts = apt.participantDepartmentIds ?? [];
  if (ids.length === 0 && depts.length === 0) return "—";
  const parts: string[] = [];
  for (const id of ids) {
    const p = people.find((x) => x.id === id);
    const name = p ? personDisplayName(p) : "Unknown";
    parts.push(currentUserId && id === currentUserId ? `${name} (you)` : name);
  }
  for (const d of depts) {
    parts.push(`${d} (dept)`);
  }
  return parts.join(", ");
}
