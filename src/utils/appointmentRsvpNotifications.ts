import type { Appointment, Person } from "../types";
import { appointmentAttendeeIds } from "./appointmentParticipants";
import { activeAppointmentOccurrences } from "./appointmentDisplay";
import { getOccurrenceRsvpAnswer } from "./appointmentRsvp";
import { isAppointmentRelevantToPerson } from "./appointments";
import { isOccurrencePast, rsvpPromptOccurrence } from "./appointmentOccurrence";
import { upsertAppointmentRsvpNotifications } from "../firebase/notifications";
import type { Firestore } from "firebase/firestore";

export function appointmentRsvpNotificationId(
  appointmentId: string,
  occurrenceIndex: number,
  recipientId: string
): string {
  return `${appointmentId}_rsvp_${occurrenceIndex}_${recipientId}`;
}

/** Create RSVP notifications once per occurrence — existing ones are left unchanged (no sound spam). */
export async function tryFireAppointmentRsvpNotifications(
  db: Firestore,
  orgId: string,
  appointment: Appointment,
  people: Person[],
  nowMs = Date.now()
): Promise<void> {
  if (appointment.status === "canceled" && !appointment.recurrenceCanceledFrom) return;

  const active = activeAppointmentOccurrences(appointment);
  const promptOcc = rsvpPromptOccurrence(active, nowMs);
  if (!promptOcc || isOccurrencePast(promptOcc, nowMs)) return;

  const recipients = recipientsForAppointmentRsvp(appointment, people).filter((id) =>
    isAppointmentRelevantToPerson(appointment, id, people)
  );
  const pendingRecipients = recipients.filter(
    (id) => getOccurrenceRsvpAnswer(appointment, promptOcc.index, id) === "pending"
  );
  if (pendingRecipients.length === 0) return;

  await upsertAppointmentRsvpNotifications(
    db,
    orgId,
    appointment.id,
    appointment.title,
    promptOcc.index,
    promptOcc.startsAt,
    promptOcc.endsAt,
    pendingRecipients
  );
}

function recipientsForAppointmentRsvp(appointment: Appointment, people: Person[]): string[] {
  return appointmentAttendeeIds(appointment, people);
}
