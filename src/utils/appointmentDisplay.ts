import type { Appointment } from "../types";
import { generateRecurrenceOccurrences } from "./appointmentRecurrence";
import {
  canceledOccurrenceIndexSet,
  effectiveRecurrenceCount,
} from "./appointmentOccurrence";

const LIST_GRACE_MS = 60 * 60 * 1000;

export type AppointmentOccurrence = {
  startsAt: string;
  endsAt?: string;
  index: number;
};

/** Legacy series stored as many Firestore docs (pre-refactor). */
export function isLegacyMaterializedSeries(apt: Appointment): boolean {
  return Boolean(apt.recurrenceSeriesId && typeof apt.recurrenceIndex === "number");
}

/** Sibling instance of a legacy materialized series (not the list representative). */
export function isLegacyMaterializedSibling(apt: Appointment): boolean {
  return isLegacyMaterializedSeries(apt) && (apt.recurrenceIndex ?? 0) > 0;
}

/** Single-doc recurring series (current model). */
export function isRecurringAppointment(apt: Appointment): boolean {
  if (isLegacyMaterializedSibling(apt)) return false;
  if (apt.recurrenceOngoing && apt.recurrenceRule) return true;
  const count = apt.recurrenceCount;
  return Boolean(apt.recurrenceRule && count && count > 1);
}

export function expandAppointmentOccurrences(apt: Appointment): AppointmentOccurrence[] {
  if (isLegacyMaterializedSeries(apt)) {
    return [{ startsAt: apt.startsAt, endsAt: apt.endsAt, index: apt.recurrenceIndex ?? 0 }];
  }
  if (apt.recurrenceRule && (apt.recurrenceOngoing || (apt.recurrenceCount && apt.recurrenceCount > 1))) {
    const count = effectiveRecurrenceCount(apt);
    const generated = generateRecurrenceOccurrences(
      apt.startsAt,
      apt.endsAt,
      apt.recurrenceRule,
      count
    );
    return generated.map((o, index) => ({ ...o, index }));
  }
  return [{ startsAt: apt.startsAt, endsAt: apt.endsAt, index: 0 }];
}

function recurrenceCutoffMs(apt: Appointment): number | null {
  const from = apt.recurrenceCanceledFrom?.trim();
  if (!from) return null;
  const ms = new Date(from).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Occurrences still active (not truncated by recurrenceCanceledFrom or per-instance cancel). */
export function activeAppointmentOccurrences(apt: Appointment): AppointmentOccurrence[] {
  const cutoff = recurrenceCutoffMs(apt);
  const canceled = canceledOccurrenceIndexSet(apt);
  const all = expandAppointmentOccurrences(apt);
  return all.filter((o) => {
    if (canceled.has(o.index)) return false;
    if (cutoff === null) return true;
    return new Date(o.startsAt).getTime() < cutoff;
  });
}

export function appointmentStartsAtMsForList(apt: Appointment, nowMs = Date.now()): number {
  const occ = listDisplayOccurrence(apt, nowMs);
  const ms = new Date(occ.startsAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function listDisplayOccurrence(apt: Appointment, nowMs = Date.now()): AppointmentOccurrence {
  const grace = nowMs - LIST_GRACE_MS;
  const active = activeAppointmentOccurrences(apt);
  const upcoming = active.filter((o) => new Date(o.startsAt).getTime() >= grace);
  if (upcoming.length > 0) return upcoming[0]!;
  const last = active[active.length - 1];
  return last ?? { startsAt: apt.startsAt, endsAt: apt.endsAt, index: 0 };
}

export type AppointmentListTab = "upcoming" | "past" | "canceled";

export function appointmentMatchesListTab(
  apt: Appointment,
  tab: AppointmentListTab,
  nowMs = Date.now()
): boolean {
  const grace = nowMs - LIST_GRACE_MS;

  if (tab === "canceled") {
    return apt.status === "canceled" || Boolean(apt.recurrenceCanceledFrom);
  }

  if (apt.status === "canceled" && !apt.recurrenceCanceledFrom) return false;

  const active = activeAppointmentOccurrences(apt);
  if (active.length === 0) return false;

  if (tab === "upcoming") {
    return active.some((o) => new Date(o.startsAt).getTime() >= grace);
  }

  return active.some((o) => new Date(o.startsAt).getTime() < grace);
}

/** One row per series in the appointments list (hides legacy materialized siblings). */
export function appointmentsForListView(appointments: Appointment[]): Appointment[] {
  return appointments.filter((apt) => !isLegacyMaterializedSibling(apt));
}

export type CalendarAppointmentItem = {
  appointment: Appointment;
  startsAt: string;
  endsAt?: string;
  occurrenceIndex: number;
};

/** Expand recurring appointments for the calendar grid. */
export function appointmentsForCalendarView(appointments: Appointment[]): CalendarAppointmentItem[] {
  const out: CalendarAppointmentItem[] = [];

  for (const apt of appointments) {
    if (!apt.startsAt) continue;
    if (isLegacyMaterializedSeries(apt)) {
      if (apt.status !== "scheduled") continue;
      out.push({
        appointment: apt,
        startsAt: apt.startsAt,
        endsAt: apt.endsAt,
        occurrenceIndex: apt.recurrenceIndex ?? 0,
      });
      continue;
    }

    if (apt.status === "canceled" && !apt.recurrenceCanceledFrom) continue;

    const active = activeAppointmentOccurrences(apt);
    for (const occ of active) {
      out.push({
        appointment: apt,
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
        occurrenceIndex: occ.index,
      });
    }
  }

  return out;
}

export function lastPastOccurrenceEndIso(
  apt: Appointment,
  cancelFromIso: string
): string | undefined {
  const cancelMs = new Date(cancelFromIso).getTime();
  if (Number.isNaN(cancelMs)) return undefined;

  const past = expandAppointmentOccurrences(apt).filter(
    (o) => new Date(o.startsAt).getTime() < cancelMs
  );
  const last = past[past.length - 1];
  if (!last) return undefined;
  return last.endsAt ?? last.startsAt;
}
