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
  untilIso?: string
): string[] {
  return [`RRULE:${buildGoogleRecurrenceRRule(rule, count, untilIso)}`];
}

/** True when appointment is a single-doc recurring series. */
export function isRecurringCrmAppointment(apt: {
  recurrenceRule?: unknown;
  recurrenceCount?: unknown;
  recurrenceSeriesId?: unknown;
  recurrenceIndex?: unknown;
}): boolean {
  if (apt.recurrenceSeriesId && typeof apt.recurrenceIndex === "number" && apt.recurrenceIndex > 0) {
    return false;
  }
  const rule = normalizeRecurrenceRule(apt.recurrenceRule);
  const count = normalizeRecurrenceCount(apt.recurrenceCount);
  return Boolean(rule && count > 1);
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

export function expandCrmAppointmentOccurrences(apt: {
  startsAt: string;
  endsAt?: string;
  recurrenceRule?: unknown;
  recurrenceCount?: unknown;
}): { startsAt: string; endsAt?: string }[] {
  const rule = normalizeRecurrenceRule(apt.recurrenceRule);
  const count = normalizeRecurrenceCount(apt.recurrenceCount);
  if (!rule || count <= 1) {
    return [{ startsAt: apt.startsAt, endsAt: apt.endsAt }];
  }
  const firstStartMs = new Date(apt.startsAt).getTime();
  const durationMs =
    apt.endsAt && !Number.isNaN(new Date(apt.endsAt).getTime())
      ? new Date(apt.endsAt).getTime() - firstStartMs
      : 0;
  const out: { startsAt: string; endsAt?: string }[] = [];
  for (let i = 0; i < count; i++) {
    const startsAt = occurrenceStartsAt(apt.startsAt, rule, i);
    const endsAt =
      durationMs > 0
        ? new Date(new Date(startsAt).getTime() + durationMs).toISOString()
        : undefined;
    out.push({ startsAt, endsAt });
  }
  return out;
}

export function lastPastOccurrenceEndBefore(
  apt: { startsAt: string; endsAt?: string; recurrenceRule?: unknown; recurrenceCount?: unknown },
  cancelFromIso: string
): string | undefined {
  const cancelMs = new Date(cancelFromIso).getTime();
  if (Number.isNaN(cancelMs)) return undefined;
  const past = expandCrmAppointmentOccurrences(apt).filter(
    (o) => new Date(o.startsAt).getTime() < cancelMs
  );
  const last = past[past.length - 1];
  if (!last) return undefined;
  return last.endsAt ?? last.startsAt;
}
