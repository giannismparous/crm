import type { CalendarBuildContext } from "./calendarContext";
import type { CrmAppointment } from "./crmData";
import { ORG_TIMEZONE } from "./constants";
import { expandAllCrmAppointmentOccurrences } from "./recurrenceRrule";

export type AppointmentRsvpAnswer = "yes" | "no";

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x).trim()).filter(Boolean))];
}

function normalizeDepts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((d) => String(d).trim()).filter(Boolean))];
}

function personInDepartment(person: { departments: string[] }, dept: string): boolean {
  return person.departments.includes(dept);
}

export function appointmentAttendeeIds(
  apt: Pick<CrmAppointment, "participantIds" | "participantDepartmentIds">,
  ctx: CalendarBuildContext
): string[] {
  const ids = new Set<string>();
  for (const id of normalizeIds(apt.participantIds)) ids.add(id);
  const depts = normalizeDepts(apt.participantDepartmentIds);
  for (const person of ctx.people.values()) {
    if (depts.some((d) => personInDepartment(person, d))) ids.add(person.id);
  }
  return [...ids].sort();
}

function answerLabel(answer: AppointmentRsvpAnswer | undefined): string {
  if (answer === "yes") return "Yes";
  if (answer === "no") return "No";
  return "Pending";
}

export function formatOccurrenceDateForCalendar(startsAt: string): string {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: ORG_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRsvpSectionForCalendar(
  apt: CrmAppointment,
  ctx: CalendarBuildContext
): string {
  const attendeeIds = appointmentAttendeeIds(apt, ctx);
  if (attendeeIds.length === 0) return "";

  const rsvp = apt.occurrenceRsvp ?? {};
  const occurrences = expandAllCrmAppointmentOccurrences(apt);
  const cutoffMs = apt.recurrenceCanceledFrom
    ? new Date(apt.recurrenceCanceledFrom).getTime()
    : null;
  const canceled = new Set(
    (apt.canceledOccurrenceIndices ?? []).filter((n) => Number.isInteger(n) && n >= 0)
  );

  if (occurrences.length <= 1) {
    const answers = rsvp["0"] ?? {};
    const lines = attendeeIds.map((id) => {
      const name = ctx.people.get(id)?.name ?? "Member";
      return `• ${name} - ${answerLabel(answers[id])}`;
    });
    return lines.length > 0 ? ["RSVP:", ...lines].join("\n") : "";
  }

  const blocks: string[] = ["RSVP:"];
  for (const occ of occurrences) {
    if (canceled.has(occ.index)) continue;
    const startMs = new Date(occ.startsAt).getTime();
    if (cutoffMs !== null && !Number.isNaN(cutoffMs) && startMs >= cutoffMs) continue;
    const answers = rsvp[String(occ.index)] ?? {};
    blocks.push(`${formatOccurrenceDateForCalendar(occ.startsAt)}:`);
    for (const id of attendeeIds) {
      const name = ctx.people.get(id)?.name ?? "Member";
      blocks.push(`• ${name} - ${answerLabel(answers[id])}`);
    }
  }
  return blocks.length > 1 ? blocks.join("\n") : "";
}
