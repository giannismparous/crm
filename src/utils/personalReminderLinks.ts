import type { Appointment, PersonalReminder, Person } from "../types";
import { personDisplayName } from "./appointments";

/** True when the person created the reminder, is listed, or belongs to an invited department. */
export function isPersonalReminderRelevantToPerson(
  reminder: PersonalReminder,
  personId: string,
  people: Person[]
): boolean {
  if (!personId) return false;
  if (reminder.ownerId === personId) return true;
  if (reminder.participantIds.includes(personId)) return true;
  const depts = reminder.participantDepartmentIds ?? [];
  if (depts.length === 0) return false;
  const person = people.find((p) => p.id === personId);
  if (!person) return false;
  return depts.some((d) => person.departments.includes(d));
}

export function formatPersonalReminderParticipants(
  reminder: PersonalReminder,
  people: Person[],
  currentUserId?: string
): string {
  const ids = reminder.participantIds.filter(Boolean);
  const depts = reminder.participantDepartmentIds ?? [];
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

/** Apply appointment → task inheritance and normalize optional link ids. */
export function resolvePersonalReminderLinks(
  fields: Partial<PersonalReminder>,
  appointments: Appointment[]
): Partial<PersonalReminder> {
  const out = { ...fields };
  const contactId = String(out.contactId ?? "").trim();
  const taskId = String(out.taskId ?? "").trim();
  const appointmentId = String(out.appointmentId ?? "").trim();

  if (contactId) out.contactId = contactId;
  else delete out.contactId;

  if (appointmentId) {
    out.appointmentId = appointmentId;
    const apt = appointments.find((a) => a.id === appointmentId);
    if (apt?.taskId) out.taskId = apt.taskId;
    else if (taskId) out.taskId = taskId;
    else delete out.taskId;
  } else {
    delete out.appointmentId;
    if (taskId) out.taskId = taskId;
    else delete out.taskId;
  }

  return out;
}

export function personalReminderLinkFieldsForWrite(
  fields: Partial<PersonalReminder>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("contactId" in fields) {
    out.contactId = fields.contactId?.trim() ? fields.contactId.trim() : null;
  }
  if ("taskId" in fields) {
    out.taskId = fields.taskId?.trim() ? fields.taskId.trim() : null;
  }
  if ("appointmentId" in fields) {
    out.appointmentId = fields.appointmentId?.trim() ? fields.appointmentId.trim() : null;
  }
  return out;
}
