import {
  loadTimezoneSettings,
  ORG_TIMEZONE,
  resolveEffectiveTimezone,
  type TimezoneSettings,
} from "./userTimezone";

export { ORG_TIMEZONE };

const ORG_LOCALE = "en-GB";

let activeTimezone = ORG_TIMEZONE;

export function getActiveTimezone(): string {
  return activeTimezone;
}

export function applyTimezoneSettings(settings: TimezoneSettings): void {
  activeTimezone = resolveEffectiveTimezone(settings);
}

export function initTimezone(userId?: string): string {
  const settings = loadTimezoneSettings(userId);
  applyTimezoneSettings(settings);
  return activeTimezone;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function wallParts(d: Date, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat(ORG_LOCALE, { timeZone, ...options }).formatToParts(d);
}

function orgParts(d: Date, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return wallParts(d, getActiveTimezone(), options);
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

export function orgDateKey(d: Date | string | number = new Date()): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const parts = orgParts(date, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

export function orgTodayDateKey(): string {
  return orgDateKey(new Date());
}

export function formatInOrgTime(
  d: Date | string | number,
  options: Intl.DateTimeFormatOptions
): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(ORG_LOCALE, { timeZone: getActiveTimezone(), ...options });
}

export function formatInTimezone(
  d: Date | string | number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(ORG_LOCALE, { timeZone, ...options });
}

export function toDatetimeLocalValue(iso: string): string {
  if (!iso.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = orgParts(d, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}T${part(parts, "hour")}:${part(parts, "minute")}`;
}

type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

function wallTimeInZone(ms: number, timeZone: string): WallTime | null {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const parts = wallParts(d, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return {
    year: Number(part(parts, "year")),
    month: Number(part(parts, "month")),
    day: Number(part(parts, "day")),
    hour: Number(part(parts, "hour")),
    minute: Number(part(parts, "minute")),
  };
}

/** Org system wall time (Europe/Athens) — used for recurrence regardless of user display timezone. */
export function wallTimeAtOrgSystem(ms: number): WallTime | null {
  return wallTimeInZone(ms, ORG_TIMEZONE);
}

function cmpWall(a: WallTime, b: WallTime): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day !== b.day) return a.day - b.day;
  if (a.hour !== b.hour) return a.hour - b.hour;
  return a.minute - b.minute;
}

/** Parse a datetime-local value (wall time in `timeZone`) to UTC ISO. */
export function datetimeLocalToIsoInZone(local: string, timeZone: string): string {
  const trimmed = local.trim();
  if (!trimmed) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(trimmed);
  if (!match) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const target: WallTime = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "12"),
    minute: Number(match[5] ?? "0"),
  };

  let low = Date.UTC(target.year, target.month - 2, target.day, target.hour - 4, target.minute);
  let high = Date.UTC(target.year, target.month, target.day, target.hour + 4, target.minute);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const w = wallTimeInZone(mid, timeZone);
    if (!w) return "";
    const c = cmpWall(w, target);
    if (c === 0) return new Date(mid).toISOString();
    if (c < 0) low = mid + 1;
    else high = mid - 1;
  }
  return "";
}

/** UTC ISO from org system wall clock (recurrence / org scheduling). */
export function isoFromOrgSystemWall(w: WallTime): string {
  const local = `${w.year}-${pad2(w.month)}-${pad2(w.day)}T${pad2(w.hour)}:${pad2(w.minute)}`;
  return datetimeLocalToIsoInZone(local, ORG_TIMEZONE);
}

/** Parse a datetime-local value (active timezone wall time) to UTC ISO. */
export function datetimeLocalToIso(local: string): string {
  return datetimeLocalToIsoInZone(local, getActiveTimezone());
}

export function orgWeekday(year: number, monthIndex: number, day: number): number {
  const iso = datetimeLocalToIso(`${year}-${pad2(monthIndex + 1)}-${pad2(day)}T12:00`);
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat(ORG_LOCALE, {
    timeZone: getActiveTimezone(),
    weekday: "short",
  }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

export function orgYmdAddDays(
  year: number,
  monthIndex: number,
  day: number,
  delta: number,
  timeZone: string = getActiveTimezone()
): { year: number; monthIndex: number; day: number } {
  const iso = datetimeLocalToIsoInZone(
    `${year}-${pad2(monthIndex + 1)}-${pad2(day)}T12:00`,
    timeZone
  );
  const ms = new Date(iso).getTime() + delta * 86400000;
  const parts = wallParts(new Date(ms), timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const y = Number(part(parts, "year"));
  const m = Number(part(parts, "month"));
  const d = Number(part(parts, "day"));
  return { year: y, monthIndex: m - 1, day: d };
}

function lastDayOfOrgMonthYear(year: number, monthIndex: number, timeZone: string): number {
  if (monthIndex === 11) {
    return orgYmdAddDays(year + 1, 0, 1, -1, timeZone).day;
  }
  return orgYmdAddDays(year, monthIndex + 1, 1, -1, timeZone).day;
}

/** Add calendar months in org system time (monthIndex 0 = January). */
export function orgYmdAddMonths(
  year: number,
  monthIndex: number,
  day: number,
  deltaMonths: number,
  timeZone: string = ORG_TIMEZONE
): { year: number; monthIndex: number; day: number } {
  const total = year * 12 + monthIndex + deltaMonths;
  const newYear = Math.floor(total / 12);
  const newMonthIndex = ((total % 12) + 12) % 12;
  const lastDay = lastDayOfOrgMonthYear(newYear, newMonthIndex, timeZone);
  return { year: newYear, monthIndex: newMonthIndex, day: Math.min(day, lastDay) };
}

export function addDaysToOrgDateKey(dateKey: string, days: number): string {
  if (!dateKey || dateKey.length < 10) return dateKey;
  const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number);
  const next = orgYmdAddDays(y, m - 1, d, days);
  return `${next.year}-${pad2(next.monthIndex + 1)}-${pad2(next.day)}`;
}

export function defaultOrgDatetimeLocal(hoursFromNow = 1): string {
  return toDatetimeLocalValue(new Date(Date.now() + hoursFromNow * 3600000).toISOString());
}
