import type { SalesContact } from "../types";
import { orgDateKey, orgTodayDateKey } from "./orgTimezone";

/** True when the reminder due calendar day is before today in Athens (ignored when done). */
export function isReminderOverdue(dueAt: string, done = false): boolean {
  if (done) return false;
  const dueKey = orgDateKey(dueAt);
  if (!dueKey) return false;
  return dueKey < orgTodayDateKey();
}

/** Earliest open reminder due time, or null if none */
export function nextOpenReminderMs(c: SalesContact): number | null {
  const open = c.reminders.filter((r) => !r.done).map((r) => new Date(r.dueAt).getTime());
  if (!open.length) return null;
  return Math.min(...open);
}

export function urgencyLabel(c: SalesContact): string | null {
  const ms = nextOpenReminderMs(c);
  if (ms === null) return null;
  const now = Date.now();
  if (ms < now) return "Reminder overdue";
  const days = Math.ceil((ms - now) / 86400000);
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Next in ${days}d`;
}
