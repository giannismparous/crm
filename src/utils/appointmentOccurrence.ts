import type { Appointment } from "../types";
import {
  MIN_RECURRENCE_COUNT,
  occurrenceStartsAt,
  type AppointmentRecurrenceRule,
} from "./appointmentRecurrence";
import { orgYmdAddMonths, ORG_TIMEZONE } from "./orgTimezone";

export const RECURRENCE_HORIZON_MONTHS = 3;
const MAX_GENERATED_OCCURRENCES = 200;

export type AppointmentOccurrenceSlice = {
  startsAt: string;
  endsAt?: string;
  index: number;
};

export function occurrenceEndMs(occ: Pick<AppointmentOccurrenceSlice, "startsAt" | "endsAt">): number {
  const raw = occ.endsAt?.trim() || occ.startsAt;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function occurrenceStartMs(occ: Pick<AppointmentOccurrenceSlice, "startsAt">): number {
  const ms = new Date(occ.startsAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** After the occurrence end (or start when no end), RSVP / cancel are locked. */
export function isOccurrencePast(
  occ: Pick<AppointmentOccurrenceSlice, "startsAt" | "endsAt">,
  nowMs = Date.now()
): boolean {
  const end = occurrenceEndMs(occ);
  return end > 0 && nowMs > end;
}

export function recurrenceHorizonEndMs(nowMs = Date.now()): number {
  const d = new Date(nowMs);
  const w = {
    year: d.getFullYear(),
    monthIndex: d.getMonth(),
    day: d.getDate(),
  };
  const next = orgYmdAddMonths(w.year, w.monthIndex, w.day, RECURRENCE_HORIZON_MONTHS, ORG_TIMEZONE);
  const horizonIso = new Date(
    Date.UTC(next.year, next.monthIndex, next.day, 23, 59, 59, 999)
  ).toISOString();
  return new Date(horizonIso).getTime();
}

/** How many occurrences to materialize for an ongoing series (~3 months ahead). */
export function computeOngoingRecurrenceCount(
  firstStartsAtIso: string,
  rule: AppointmentRecurrenceRule,
  nowMs = Date.now()
): number {
  const horizon = recurrenceHorizonEndMs(nowMs);
  let count = 0;
  for (let index = 0; index < MAX_GENERATED_OCCURRENCES; index++) {
    const startMs = new Date(occurrenceStartsAt(firstStartsAtIso, rule, index)).getTime();
    if (Number.isNaN(startMs) || startMs > horizon) break;
    count = index + 1;
  }
  return Math.max(MIN_RECURRENCE_COUNT, count);
}

export function effectiveRecurrenceCount(apt: Appointment, nowMs = Date.now()): number {
  if (!apt.recurrenceRule) return 1;
  if (apt.recurrenceOngoing) {
    return computeOngoingRecurrenceCount(apt.startsAt, apt.recurrenceRule, nowMs);
  }
  const count = apt.recurrenceCount;
  if (!count || count < 2) return 1;
  return count;
}

export function canceledOccurrenceIndexSet(apt: Appointment): Set<number> {
  return new Set(
    (apt.canceledOccurrenceIndices ?? []).filter((n) => Number.isInteger(n) && n >= 0)
  );
}

export function isOccurrenceCanceled(apt: Appointment, occurrenceIndex: number): boolean {
  return canceledOccurrenceIndexSet(apt).has(occurrenceIndex);
}

/**
 * Which occurrence should prompt RSVP now:
 * - First upcoming when no prior occurrence, or when the prior one has ended.
 */
export function rsvpPromptOccurrence(
  occurrences: AppointmentOccurrenceSlice[],
  nowMs = Date.now()
): AppointmentOccurrenceSlice | null {
  const sorted = [...occurrences].sort((a, b) => a.index - b.index);
  const upcoming = sorted.filter((o) => !isOccurrencePast(o, nowMs));
  if (upcoming.length === 0) return null;

  const next = upcoming[0]!;
  if (next.index === 0) return next;

  const prev = sorted.find((o) => o.index === next.index - 1);
  if (!prev) return next;
  if (isOccurrencePast(prev, nowMs)) return next;
  return null;
}

export type AppointmentCancelScope = "instance" | "this_and_future" | "entire_series";
