import { ORG_TIMEZONE } from "./constants";

export type AppointmentRecurrenceKind = "daily" | "weekly" | "monthly" | "monthly_day";

export type AppointmentRecurrenceRule = {
  kind: AppointmentRecurrenceKind;
  interval: number;
  dayOfMonth?: number;
};

export function normalizeRecurrenceInterval(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 52);
}

export function normalizeRecurrenceCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 12;
  return Math.min(52, Math.max(2, n));
}

export function normalizeRecurrenceRule(raw: unknown): AppointmentRecurrenceRule | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const kind = data.kind;
  if (kind !== "daily" && kind !== "weekly" && kind !== "monthly" && kind !== "monthly_day") {
    return undefined;
  }
  const rule: AppointmentRecurrenceRule = {
    kind,
    interval: normalizeRecurrenceInterval(data.interval),
  };
  if (kind === "monthly_day") {
    const day = Math.floor(Number(data.dayOfMonth));
    rule.dayOfMonth = Number.isFinite(day) ? Math.min(31, Math.max(1, day)) : 1;
  }
  return rule;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Google Calendar RRULE UNTIL value in UTC (YYYYMMDDTHHMMSSZ). */
export function rruleUntilUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

export function buildGoogleRecurrenceRRule(
  rule: AppointmentRecurrenceRule,
  count: number,
  untilIso?: string
): string {
  const interval = normalizeRecurrenceInterval(rule.interval);
  const parts: string[] = [];

  switch (rule.kind) {
    case "daily":
      parts.push("FREQ=DAILY");
      break;
    case "weekly":
      parts.push("FREQ=WEEKLY");
      break;
    case "monthly":
      parts.push("FREQ=MONTHLY");
      break;
    case "monthly_day": {
      parts.push("FREQ=MONTHLY");
      const day = Math.min(31, Math.max(1, Math.floor(Number(rule.dayOfMonth)) || 1));
      parts.push(`BYMONTHDAY=${day}`);
      break;
    }
  }

  if (interval > 1) parts.push(`INTERVAL=${interval}`);

  const until = untilIso ? rruleUntilUtc(untilIso) : "";
  if (until) {
    parts.push(`UNTIL=${until}`);
  } else {
    parts.push(`COUNT=${normalizeRecurrenceCount(count)}`);
  }

  return parts.join(";");
}

export function googleRecurrenceLines(
  rule: AppointmentRecurrenceRule,
  count: number,
  untilIso?: string,
  exdateDateKeys?: string[]
): string[] {
  const lines = [`RRULE:${buildGoogleRecurrenceRRule(rule, count, untilIso)}`];
  const keys = [...new Set((exdateDateKeys ?? []).map((k) => k.trim().slice(0, 10)).filter(Boolean))];
  if (keys.length > 0) {
    lines.push(`EXDATE;VALUE=DATE:${keys.map((k) => k.replace(/-/g, "")).join(",")}`);
  }
  return lines;
}

/** True when appointment is a single-doc recurring series. */
export function isRecurringCrmAppointment(apt: {
  recurrenceRule?: unknown;
  recurrenceCount?: unknown;
  recurrenceOngoing?: unknown;
  recurrenceSeriesId?: unknown;
  recurrenceIndex?: unknown;
}): boolean {
  if (apt.recurrenceSeriesId && typeof apt.recurrenceIndex === "number" && apt.recurrenceIndex > 0) {
    return false;
  }
  const rule = normalizeRecurrenceRule(apt.recurrenceRule);
  if (!rule) return false;
  if (apt.recurrenceOngoing === true) return true;
  const count = normalizeRecurrenceCount(apt.recurrenceCount);
  return count > 1;
}

const ORG_LOCALE = "en-GB";

type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

function wallParts(d: Date, timeZone: string): WallTime | null {
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat(ORG_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

function datetimeLocalToIsoInZone(local: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!match) return "";
  const target: WallTime = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "12"),
    minute: Number(match[5] ?? "0"),
  };
  const cmp = (a: WallTime, b: WallTime) =>
    a.year - b.year || a.month - b.month || a.day - b.day || a.hour - b.hour || a.minute - b.minute;

  let low = Date.UTC(target.year, target.month - 2, target.day, target.hour - 4, target.minute);
  let high = Date.UTC(target.year, target.month, target.day, target.hour + 4, target.minute);
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const w = wallParts(new Date(mid), timeZone);
    if (!w) return "";
    const c = cmp(w, target);
    if (c === 0) return new Date(mid).toISOString();
    if (c < 0) low = mid + 1;
    else high = mid - 1;
  }
  return "";
}

function isoFromOrgWall(w: WallTime): string {
  return datetimeLocalToIsoInZone(
    `${w.year}-${pad2(w.month)}-${pad2(w.day)}T${pad2(w.hour)}:${pad2(w.minute)}`,
    ORG_TIMEZONE
  );
}

function orgYmdAddDays(
  year: number,
  monthIndex: number,
  day: number,
  delta: number,
  timeZone: string
): { year: number; monthIndex: number; day: number } {
  const iso = datetimeLocalToIsoInZone(
    `${year}-${pad2(monthIndex + 1)}-${pad2(day)}T12:00`,
    timeZone
  );
  const ms = new Date(iso).getTime() + delta * 86400000;
  const w = wallParts(new Date(ms), timeZone);
  if (!w) return { year, monthIndex, day };
  return { year: w.year, monthIndex: w.month - 1, day: w.day };
}

function orgYmdAddMonths(
  year: number,
  monthIndex: number,
  day: number,
  deltaMonths: number,
  timeZone: string
): { year: number; monthIndex: number; day: number } {
  const total = year * 12 + monthIndex + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonthIndex = ((total % 12) + 12) % 12;
  const lastDay = orgYmdAddDays(newYear, newMonthIndex + 1, 1, -1, timeZone).day;
  return { year: newYear, monthIndex: newMonthIndex, day: Math.min(day, lastDay) };
}

function occurrenceStartsAt(
  firstStartsAtIso: string,
  rule: AppointmentRecurrenceRule,
  index: number
): string {
  if (index <= 0) return firstStartsAtIso;
  const w = wallParts(new Date(firstStartsAtIso), ORG_TIMEZONE);
  if (!w) return firstStartsAtIso;
  const interval = normalizeRecurrenceInterval(rule.interval);
  const monthIndex = w.month - 1;
  let next: { year: number; monthIndex: number; day: number };
  switch (rule.kind) {
    case "daily":
      next = orgYmdAddDays(w.year, monthIndex, w.day, index * interval, ORG_TIMEZONE);
      break;
    case "weekly":
      next = orgYmdAddDays(w.year, monthIndex, w.day, index * interval * 7, ORG_TIMEZONE);
      break;
    case "monthly":
      next = orgYmdAddMonths(w.year, monthIndex, w.day, index * interval, ORG_TIMEZONE);
      break;
    case "monthly_day":
      next = orgYmdAddMonths(
        w.year,
        monthIndex,
        Math.min(31, Math.max(1, Math.floor(Number(rule.dayOfMonth)) || 1)),
        index * interval,
        ORG_TIMEZONE
      );
      break;
  }
  return isoFromOrgWall({
    year: next.year,
    month: next.monthIndex + 1,
    day: next.day,
    hour: w.hour,
    minute: w.minute,
  });
}

const RECURRENCE_HORIZON_MONTHS = 3;
const MAX_GENERATED_OCCURRENCES = 200;
const orgTaskDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIMEZONE });

export type CrmAppointmentOccurrenceSlice = {
  startsAt: string;
  endsAt?: string;
  index: number;
};

type CrmAppointmentRecurrenceInput = {
  startsAt: string;
  endsAt?: string;
  recurrenceRule?: unknown;
  recurrenceCount?: unknown;
  recurrenceOngoing?: unknown;
  recurrenceCanceledFrom?: string;
  canceledOccurrenceIndices?: number[];
};

function recurrenceHorizonEndMs(nowMs = Date.now()): number {
  const d = new Date(nowMs);
  const w = wallParts(d, ORG_TIMEZONE);
  if (!w) return nowMs;
  const next = orgYmdAddMonths(w.year, w.month - 1, w.day, RECURRENCE_HORIZON_MONTHS, ORG_TIMEZONE);
  return new Date(
    Date.UTC(next.year, next.monthIndex, next.day, 23, 59, 59, 999)
  ).getTime();
}

function computeOngoingRecurrenceCount(
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
  return Math.max(2, count);
}

export function effectiveCrmAppointmentRecurrenceCount(
  apt: CrmAppointmentRecurrenceInput,
  nowMs = Date.now()
): number {
  const rule = normalizeRecurrenceRule(apt.recurrenceRule);
  if (!rule || !isRecurringCrmAppointment(apt)) return 1;
  if (apt.recurrenceOngoing === true) {
    return computeOngoingRecurrenceCount(apt.startsAt, rule, nowMs);
  }
  return normalizeRecurrenceCount(apt.recurrenceCount);
}

export function expandAllCrmAppointmentOccurrences(
  apt: CrmAppointmentRecurrenceInput,
  nowMs = Date.now()
): CrmAppointmentOccurrenceSlice[] {
  const startsAt = apt.startsAt?.trim();
  if (!startsAt) return [];
  const rule = normalizeRecurrenceRule(apt.recurrenceRule);
  if (!rule || !isRecurringCrmAppointment(apt)) {
    return [{ startsAt, endsAt: apt.endsAt, index: 0 }];
  }
  const count = effectiveCrmAppointmentRecurrenceCount(apt, nowMs);
  const firstStartMs = new Date(startsAt).getTime();
  const durationMs =
    apt.endsAt && !Number.isNaN(new Date(apt.endsAt).getTime())
      ? new Date(apt.endsAt).getTime() - firstStartMs
      : 0;
  const out: CrmAppointmentOccurrenceSlice[] = [];
  for (let i = 0; i < count; i++) {
    const occStartsAt = occurrenceStartsAt(startsAt, rule, i);
    const endsAt =
      durationMs > 0
        ? new Date(new Date(occStartsAt).getTime() + durationMs).toISOString()
        : undefined;
    out.push({ startsAt: occStartsAt, endsAt, index: i });
  }
  return out;
}

function isActiveCrmAppointmentOccurrence(
  apt: CrmAppointmentRecurrenceInput,
  occ: CrmAppointmentOccurrenceSlice
): boolean {
  const canceled = new Set(
    (apt.canceledOccurrenceIndices ?? []).filter((n) => Number.isInteger(n) && n >= 0)
  );
  if (canceled.has(occ.index)) return false;
  const cutoff = apt.recurrenceCanceledFrom?.trim();
  if (!cutoff) return true;
  const cutoffMs = new Date(cutoff).getTime();
  if (Number.isNaN(cutoffMs)) return true;
  return new Date(occ.startsAt).getTime() < cutoffMs;
}

/** Active occurrences only (respects per-instance cancel and this-and-future cancel). */
export function expandCrmAppointmentOccurrences(
  apt: CrmAppointmentRecurrenceInput,
  nowMs = Date.now()
): { startsAt: string; endsAt?: string }[] {
  return expandAllCrmAppointmentOccurrences(apt, nowMs)
    .filter((o) => isActiveCrmAppointmentOccurrence(apt, o))
    .map(({ startsAt, endsAt }) => ({ startsAt, endsAt }));
}

export function lastPastOccurrenceEndBefore(
  apt: CrmAppointmentRecurrenceInput,
  cancelFromIso: string
): string | undefined {
  const cancelMs = new Date(cancelFromIso).getTime();
  if (Number.isNaN(cancelMs)) return undefined;
  const past = expandAllCrmAppointmentOccurrences(apt).filter(
    (o) => new Date(o.startsAt).getTime() < cancelMs
  );
  const last = past[past.length - 1];
  if (!last) return undefined;
  return last.endsAt ?? last.startsAt;
}

/** Datetime EXDATE values for individually canceled meeting occurrences. */
export function crmAppointmentCanceledExdateStartsAt(
  apt: CrmAppointmentRecurrenceInput,
  nowMs = Date.now()
): string[] {
  const indices = (apt.canceledOccurrenceIndices ?? []).filter(
    (n) => Number.isInteger(n) && n >= 0
  );
  if (indices.length === 0 || !isRecurringCrmAppointment(apt)) return [];
  const canceled = new Set(indices);
  return expandAllCrmAppointmentOccurrences(apt, nowMs)
    .filter((o) => canceled.has(o.index))
    .map((o) => o.startsAt);
}

export function googleRecurrenceLinesForDateTime(
  rule: AppointmentRecurrenceRule,
  count: number,
  untilIso?: string,
  exdateStartsAtIso?: string[]
): string[] {
  const lines = [`RRULE:${buildGoogleRecurrenceRRule(rule, count, untilIso)}`];
  const parts: string[] = [];
  for (const iso of exdateStartsAtIso ?? []) {
    const w = wallParts(new Date(iso), ORG_TIMEZONE);
    if (!w) continue;
    parts.push(
      `${w.year}${pad2(w.month)}${pad2(w.day)}T${pad2(w.hour)}${pad2(w.minute)}00`
    );
  }
  const unique = [...new Set(parts)];
  if (unique.length > 0) {
    lines.push(`EXDATE;TZID=${ORG_TIMEZONE}:${unique.join(",")}`);
  }
  return lines;
}

function taskAnchorIso(dueDate: string): string {
  const key = dueDate.trim().slice(0, 10);
  return datetimeLocalToIsoInZone(`${key}T12:00`, ORG_TIMEZONE);
}

export function isRecurringCrmTask(task: {
  recurrenceRule?: unknown;
  recurrenceCount?: unknown;
  recurrenceOngoing?: unknown;
}): boolean {
  const rule = normalizeRecurrenceRule(task.recurrenceRule);
  if (!rule) return false;
  if (task.recurrenceOngoing === true) return true;
  const count = normalizeRecurrenceCount(task.recurrenceCount);
  return count > 1;
}

export function effectiveCrmTaskRecurrenceCount(
  task: {
    dueDate?: string;
    recurrenceRule?: unknown;
    recurrenceCount?: unknown;
    recurrenceOngoing?: unknown;
  },
  nowMs = Date.now()
): number {
  const rule = normalizeRecurrenceRule(task.recurrenceRule);
  if (!rule) return 1;
  const due = task.dueDate?.trim().slice(0, 10);
  if (!due) return 1;
  if (task.recurrenceOngoing === true) {
    return computeOngoingRecurrenceCount(taskAnchorIso(due), rule, nowMs);
  }
  return normalizeRecurrenceCount(task.recurrenceCount);
}

export function expandCrmTaskOccurrences(task: {
  dueDate?: string;
  recurrenceRule?: unknown;
  recurrenceCount?: unknown;
  recurrenceOngoing?: unknown;
  recurrenceCanceledFrom?: string;
  canceledOccurrenceIndices?: number[];
  completedOccurrenceIndices?: number[];
}): { dueDate: string; index: number }[] {
  const due = task.dueDate?.trim().slice(0, 10);
  if (!due) return [];
  const rule = normalizeRecurrenceRule(task.recurrenceRule);
  const recurring = isRecurringCrmTask(task);
  if (!rule || !recurring) return [{ dueDate: due, index: 0 }];

  const count = effectiveCrmTaskRecurrenceCount(task);
  const anchor = taskAnchorIso(due);
  const out: { dueDate: string; index: number }[] = [];
  for (let i = 0; i < count; i++) {
    const startsAt = occurrenceStartsAt(anchor, rule, i);
    const dueDate = orgTaskDateFormatter.format(new Date(startsAt));
    out.push({ dueDate, index: i });
  }

  const cutoff = task.recurrenceCanceledFrom?.trim();
  const cutoffKey = cutoff ? orgTaskDateFormatter.format(new Date(cutoff)) : "";
  const canceled = new Set(
    (task.canceledOccurrenceIndices ?? []).filter((n) => Number.isInteger(n) && n >= 0)
  );
  const completed = new Set(
    (task.completedOccurrenceIndices ?? []).filter((n) => Number.isInteger(n) && n >= 0)
  );

  return out.filter((o) => {
    if (canceled.has(o.index)) return false;
    if (completed.has(o.index)) return false;
    if (!cutoffKey) return true;
    return o.dueDate < cutoffKey;
  });
}

export function lastPastTaskOccurrenceDueBefore(
  task: {
    dueDate?: string;
    recurrenceRule?: unknown;
    recurrenceCount?: unknown;
    recurrenceOngoing?: unknown;
  },
  cancelFromIso: string
): string | undefined {
  const cancelKey = orgTaskDateFormatter.format(new Date(cancelFromIso));
  if (!cancelKey) return undefined;
  const due = task.dueDate?.trim().slice(0, 10);
  if (!due) return undefined;
  const rule = normalizeRecurrenceRule(task.recurrenceRule);
  if (!rule || !isRecurringCrmTask(task)) return undefined;
  const count = effectiveCrmTaskRecurrenceCount(task);
  const anchor = taskAnchorIso(due);
  const all: { dueDate: string }[] = [];
  for (let i = 0; i < count; i++) {
    const startsAt = occurrenceStartsAt(anchor, rule, i);
    all.push({ dueDate: orgTaskDateFormatter.format(new Date(startsAt)) });
  }
  const past = all.filter((o) => o.dueDate < cancelKey);
  const last = past[past.length - 1];
  if (!last) return undefined;
  return taskAnchorIso(last.dueDate);
}

function crmTaskSkippedOccurrenceIndices(task: {
  canceledOccurrenceIndices?: number[];
  completedOccurrenceIndices?: number[];
}): Set<number> {
  const skipped = new Set<number>();
  for (const n of task.canceledOccurrenceIndices ?? []) {
    if (Number.isInteger(n) && n >= 0) skipped.add(n);
  }
  for (const n of task.completedOccurrenceIndices ?? []) {
    if (Number.isInteger(n) && n >= 0) skipped.add(n);
  }
  return skipped;
}

/** YYYY-MM-DD keys for canceled/completed occurrences (Google Calendar EXDATE). */
export function crmTaskSkippedExdateKeys(task: {
  dueDate?: string;
  recurrenceRule?: unknown;
  recurrenceCount?: unknown;
  recurrenceOngoing?: unknown;
  canceledOccurrenceIndices?: number[];
  completedOccurrenceIndices?: number[];
}): string[] {
  const skipped = crmTaskSkippedOccurrenceIndices(task);
  if (skipped.size === 0 || !isRecurringCrmTask(task)) return [];
  const due = task.dueDate?.trim().slice(0, 10);
  if (!due) return [];
  const rule = normalizeRecurrenceRule(task.recurrenceRule);
  if (!rule) return [];
  const count = effectiveCrmTaskRecurrenceCount(task);
  const anchor = taskAnchorIso(due);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    if (!skipped.has(i)) continue;
    const startsAt = occurrenceStartsAt(anchor, rule, i);
    keys.push(orgTaskDateFormatter.format(new Date(startsAt)));
  }
  return keys;
}

/** @deprecated use crmTaskSkippedExdateKeys */
export function crmTaskCanceledExdateKeys(
  task: Parameters<typeof crmTaskSkippedExdateKeys>[0]
): string[] {
  return crmTaskSkippedExdateKeys(task);
}
