import type { Task } from "../types";
import { generateRecurrenceOccurrences } from "./appointmentRecurrence";
import {
  computeOngoingRecurrenceCount,
} from "./appointmentOccurrence";
import { datetimeLocalToIso, orgDateKey } from "./orgTimezone";

export type TaskOccurrence = {
  dueDate: string;
  index: number;
};

export type TaskCancelScope = "instance" | "this_and_future" | "entire_series";

/** Anchor ISO for recurrence math from a date-only due date. */
export function taskAnchorIso(dueDate: string): string {
  const key = dueDate.trim().slice(0, 10);
  return datetimeLocalToIso(`${key}T12:00`);
}

export function isRecurringTask(task: Task): boolean {
  if (task.recurrenceOngoing && task.recurrenceRule) return true;
  const count = task.recurrenceCount;
  return Boolean(task.recurrenceRule && count && count > 1);
}

export function effectiveRecurrenceCount(task: Task, nowMs = Date.now()): number {
  if (!task.recurrenceRule) return 1;
  if (task.recurrenceOngoing) {
    return computeOngoingRecurrenceCount(taskAnchorIso(task.dueDate), task.recurrenceRule, nowMs);
  }
  const count = task.recurrenceCount;
  if (!count || count < 2) return 1;
  return count;
}

export function expandTaskOccurrences(task: Task, nowMs = Date.now()): TaskOccurrence[] {
  if (
    task.recurrenceRule &&
    (task.recurrenceOngoing || (task.recurrenceCount && task.recurrenceCount > 1))
  ) {
    const count = effectiveRecurrenceCount(task, nowMs);
    const generated = generateRecurrenceOccurrences(
      taskAnchorIso(task.dueDate),
      undefined,
      task.recurrenceRule,
      count
    );
    return generated.map((o, index) => ({ dueDate: orgDateKey(o.startsAt), index }));
  }
  return [{ dueDate: task.dueDate, index: 0 }];
}

function recurrenceCutoffDateKey(task: Task): string | null {
  const from = task.recurrenceCanceledFrom?.trim();
  if (!from) return null;
  const key = orgDateKey(from);
  return key || null;
}

export function canceledOccurrenceIndexSet(task: Task): Set<number> {
  return new Set(
    (task.canceledOccurrenceIndices ?? []).filter((n) => Number.isInteger(n) && n >= 0)
  );
}

export function completedOccurrenceIndexSet(task: Task): Set<number> {
  return new Set(
    (task.completedOccurrenceIndices ?? []).filter((n) => Number.isInteger(n) && n >= 0)
  );
}

export function isOccurrenceCanceled(task: Task, occurrenceIndex: number): boolean {
  return canceledOccurrenceIndexSet(task).has(occurrenceIndex);
}

export function isOccurrenceCompleted(task: Task, occurrenceIndex: number): boolean {
  return completedOccurrenceIndexSet(task).has(occurrenceIndex);
}

/** Occurrences still active (not truncated by recurrenceCanceledFrom or per-instance cancel). */
export function activeTaskOccurrences(task: Task, nowMs = Date.now()): TaskOccurrence[] {
  const cutoff = recurrenceCutoffDateKey(task);
  const canceled = canceledOccurrenceIndexSet(task);
  return expandTaskOccurrences(task, nowMs).filter((o) => {
    if (canceled.has(o.index)) return false;
    if (cutoff === null) return true;
    return o.dueDate < cutoff;
  });
}

/** Due date shown in the task list — next open occurrence, or last active if all past. */
export function taskDisplayDueDate(task: Task, nowMs = Date.now()): string {
  return listDisplayOccurrence(task, nowMs).dueDate;
}

export function listDisplayOccurrence(task: Task, nowMs = Date.now()): TaskOccurrence {
  const today = orgDateKey(nowMs);
  const active = activeTaskOccurrences(task, nowMs);
  const open = active.filter((o) => !isOccurrenceCompleted(task, o.index));
  const upcoming = open.filter((o) => o.dueDate >= today);
  if (upcoming.length > 0) return upcoming[0]!;
  const lastOpen = open[open.length - 1];
  if (lastOpen) return lastOpen;
  const last = active[active.length - 1];
  return last ?? { dueDate: task.dueDate, index: 0 };
}

export function taskDueDateMsForList(task: Task, nowMs = Date.now()): number {
  const key = taskDisplayDueDate(task, nowMs);
  const ms = new Date(taskAnchorIso(key)).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function isFixedSeriesFullyCompleted(task: Task, nowMs = Date.now()): boolean {
  if (!isRecurringTask(task) || task.recurrenceOngoing) return false;
  const active = activeTaskOccurrences(task, nowMs);
  if (active.length === 0) return false;
  const completed = completedOccurrenceIndexSet(task);
  return active.every((o) => completed.has(o.index));
}

export function taskInCanceledTab(task: Task): boolean {
  return task.status === "canceled" || Boolean(task.recurrenceCanceledFrom?.trim());
}

export type CalendarTaskItem = {
  task: Task;
  dueDate: string;
  occurrenceIndex: number;
};

/** Expand recurring tasks for the calendar grid. */
export function tasksForCalendarView(tasks: Task[], nowMs = Date.now()): CalendarTaskItem[] {
  const out: CalendarTaskItem[] = [];

  for (const task of tasks) {
    if (!task.dueDate?.trim()) continue;
    if (task.status === "canceled" && !task.recurrenceCanceledFrom) continue;

    const active = activeTaskOccurrences(task, nowMs);
    for (const occ of active) {
      if (isOccurrenceCompleted(task, occ.index)) continue;
      out.push({
        task,
        dueDate: occ.dueDate,
        occurrenceIndex: occ.index,
      });
    }
  }

  return out;
}
