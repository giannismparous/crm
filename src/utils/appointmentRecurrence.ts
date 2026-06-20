import { loadLocale } from "../i18n/localeStorage";
import { translate } from "../i18n/translate";
import type { AppLocale } from "../i18n/types";
import {
  isoFromOrgSystemWall,
  orgYmdAddDays,
  orgYmdAddMonths,
  ORG_TIMEZONE,
  wallTimeAtOrgSystem,
} from "./orgTimezone";

export type AppointmentRecurrenceKind = "daily" | "weekly" | "monthly" | "monthly_day";

export type AppointmentRecurrenceRule = {
  kind: AppointmentRecurrenceKind;
  interval: number;
  /** Day of month (1–31) when kind is `monthly_day`. */
  dayOfMonth?: number;
};

export const DEFAULT_RECURRENCE_COUNT = 12;
export const MAX_RECURRENCE_COUNT = 52;
export const MIN_RECURRENCE_COUNT = 2;

export function normalizeRecurrenceInterval(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 52);
}

export function normalizeRecurrenceCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_RECURRENCE_COUNT;
  return Math.min(MAX_RECURRENCE_COUNT, Math.max(MIN_RECURRENCE_COUNT, n));
}

export function normalizeRecurrenceDayOfMonth(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(31, Math.max(1, n));
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
    rule.dayOfMonth = normalizeRecurrenceDayOfMonth(data.dayOfMonth);
  }
  return rule;
}

/** Nth occurrence start time (index 0 = first) — org system calendar (Europe/Athens), DST-safe. */
export function occurrenceStartsAt(
  firstStartsAtIso: string,
  rule: AppointmentRecurrenceRule,
  index: number
): string {
  if (index <= 0) return firstStartsAtIso;

  const firstMs = new Date(firstStartsAtIso).getTime();
  if (Number.isNaN(firstMs)) return firstStartsAtIso;

  const w = wallTimeAtOrgSystem(firstMs);
  if (!w) return firstStartsAtIso;

  const interval = normalizeRecurrenceInterval(rule.interval);
  const monthIndex = w.month - 1;
  const tz = ORG_TIMEZONE;

  let next: { year: number; monthIndex: number; day: number };

  switch (rule.kind) {
    case "daily":
      next = orgYmdAddDays(w.year, monthIndex, w.day, index * interval, tz);
      break;
    case "weekly":
      next = orgYmdAddDays(w.year, monthIndex, w.day, index * interval * 7, tz);
      break;
    case "monthly":
      next = orgYmdAddMonths(w.year, monthIndex, w.day, index * interval, tz);
      break;
    case "monthly_day":
      next = orgYmdAddMonths(
        w.year,
        monthIndex,
        normalizeRecurrenceDayOfMonth(rule.dayOfMonth),
        index * interval,
        tz
      );
      break;
  }

  return isoFromOrgSystemWall({
    year: next.year,
    month: next.monthIndex + 1,
    day: next.day,
    hour: w.hour,
    minute: w.minute,
  });
}

export function generateRecurrenceOccurrences(
  firstStartsAtIso: string,
  firstEndsAtIso: string | undefined,
  rule: AppointmentRecurrenceRule,
  count: number
): { startsAt: string; endsAt?: string }[] {
  const total = normalizeRecurrenceCount(count);
  const firstStartMs = new Date(firstStartsAtIso).getTime();
  const durationMs =
    firstEndsAtIso && !Number.isNaN(new Date(firstEndsAtIso).getTime())
      ? new Date(firstEndsAtIso).getTime() - firstStartMs
      : 0;

  const out: { startsAt: string; endsAt?: string }[] = [];
  for (let i = 0; i < total; i++) {
    const startsAt = occurrenceStartsAt(firstStartsAtIso, rule, i);
    const endsAt =
      durationMs > 0
        ? new Date(new Date(startsAt).getTime() + durationMs).toISOString()
        : undefined;
    out.push({ startsAt, endsAt });
  }
  return out;
}

function ordinalDayEn(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function recurrenceDayLabel(locale: AppLocale, day: number): string {
  if (locale === "el") {
    return translate(locale, "appointments.recurrence.ordinalDayEl", { n: String(day) });
  }
  return ordinalDayEn(day);
}

function meetingsSuffix(locale: AppLocale, count?: number, ongoing?: boolean): string {
  if (ongoing) {
    return translate(locale, "appointments.recurrence.ongoingSuffix");
  }
  return count && count > 1
    ? translate(locale, "appointments.recurrence.meetingsSuffix", { count: String(count) })
    : "";
}

export function formatRecurrenceSummary(
  rule: AppointmentRecurrenceRule,
  count?: number,
  options?: { ongoing?: boolean }
): string {
  const locale = loadLocale();
  const interval = normalizeRecurrenceInterval(rule.interval);
  const times = meetingsSuffix(locale, count, options?.ongoing);

  switch (rule.kind) {
    case "daily":
      return interval === 1
        ? translate(locale, "appointments.recurrence.daily", { times })
        : translate(locale, "appointments.recurrence.everyDays", { n: String(interval), times });
    case "weekly":
      return interval === 1
        ? translate(locale, "appointments.recurrence.weekly", { times })
        : translate(locale, "appointments.recurrence.everyWeeks", { n: String(interval), times });
    case "monthly":
      return interval === 1
        ? translate(locale, "appointments.recurrence.monthly", { times })
        : translate(locale, "appointments.recurrence.everyMonths", { n: String(interval), times });
    case "monthly_day": {
      const day = recurrenceDayLabel(locale, normalizeRecurrenceDayOfMonth(rule.dayOfMonth));
      return interval === 1
        ? translate(locale, "appointments.recurrence.monthlyDay", { day, times })
        : translate(locale, "appointments.recurrence.everyMonthsOnDay", {
            n: String(interval),
            day,
            times,
          });
    }
  }
}
