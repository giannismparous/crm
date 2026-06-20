import type { Appointment, AppointmentRsvpAnswer, Person } from "../types";
import { appointmentAttendeeIds } from "./appointmentParticipants";
import { personDisplayName } from "./appointments";
import {
  activeAppointmentOccurrences,
  expandAppointmentOccurrences,
  isRecurringAppointment,
} from "./appointmentDisplay";
import { formatInOrgTime, orgDateKey, orgTodayDateKey } from "./orgTimezone";

export type AppointmentRsvpStatus = AppointmentRsvpAnswer | "pending";

export function normalizeOccurrenceRsvp(
  value: unknown
): Record<string, Record<string, AppointmentRsvpAnswer>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, Record<string, AppointmentRsvpAnswer>> = {};
  for (const [occKey, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const answers: Record<string, AppointmentRsvpAnswer> = {};
    for (const [personId, answer] of Object.entries(row as Record<string, unknown>)) {
      const id = String(personId ?? "").trim();
      if (!id) continue;
      if (answer === "yes" || answer === "no") answers[id] = answer;
    }
    if (Object.keys(answers).length > 0) out[String(occKey)] = answers;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function getOccurrenceRsvpAnswer(
  apt: Pick<Appointment, "occurrenceRsvp">,
  occurrenceIndex: number,
  personId: string
): AppointmentRsvpStatus {
  const answer = apt.occurrenceRsvp?.[String(occurrenceIndex)]?.[personId];
  if (answer === "yes" || answer === "no") return answer;
  return "pending";
}

export function buildRsvpPatch(
  apt: Appointment,
  occurrenceIndex: number,
  personId: string,
  answer: AppointmentRsvpAnswer
): Pick<Appointment, "occurrenceRsvp"> {
  const key = String(occurrenceIndex);
  return {
    occurrenceRsvp: {
      ...(apt.occurrenceRsvp ?? {}),
      [key]: {
        ...(apt.occurrenceRsvp?.[key] ?? {}),
        [personId]: answer,
      },
    },
  };
}

export function sortedAppointmentAttendees(
  apt: Pick<Appointment, "participantIds" | "participantDepartmentIds">,
  people: Person[]
): Person[] {
  const ids = appointmentAttendeeIds(apt, people);
  const byId = new Map(people.map((p) => [p.id, p]));
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is Person => Boolean(p))
    .sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b)));
}

export function occurrenceLabel(startsAt: string, endsAt?: string): string {
  const start = formatInOrgTime(startsAt, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endsAt) return start;
  const end = formatInOrgTime(endsAt, { hour: "numeric", minute: "2-digit" });
  return `${start} – ${end}`;
}

export function selectableOccurrences(apt: Appointment, nowMs = Date.now()) {
  const active = activeAppointmentOccurrences(apt);
  const base = active.length > 0 ? active : expandAppointmentOccurrences(apt);
  const todayKey = orgTodayDateKey();
  const fromToday = base.filter((o) => orgDateKey(o.startsAt) >= todayKey);
  if (fromToday.length > 0) return fromToday;
  // All occurrences are before today — keep the list representative for past-only series.
  void nowMs;
  return base.length > 0 ? [base[base.length - 1]!] : base;
}

export function firstSelectableOccurrenceIndex(apt: Appointment, nowMs = Date.now()): number {
  return selectableOccurrences(apt, nowMs)[0]?.index ?? 0;
}

export function appointmentHasMultipleSelectableOccurrences(apt: Appointment, nowMs = Date.now()): boolean {
  return isRecurringAppointment(apt) && selectableOccurrences(apt, nowMs).length > 1;
}

export function formatRsvpAnswerLabel(
  status: AppointmentRsvpStatus,
  labels: { yes: string; no: string; pending: string }
): string {
  if (status === "yes") return labels.yes;
  if (status === "no") return labels.no;
  return labels.pending;
}
