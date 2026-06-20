import type { Task } from "../types";
import {
  completedOccurrenceIndexSet,
  isFixedSeriesFullyCompleted,
  isRecurringTask,
  listDisplayOccurrence,
} from "./taskDisplay";

export function completeOccurrencePatch(task: Task, occurrenceIndex: number): Partial<Task> {
  const existing = completedOccurrenceIndexSet(task);
  existing.add(occurrenceIndex);
  return {
    completedOccurrenceIndices: [...existing].sort((a, b) => a - b),
    finishedByIds: [],
  };
}

/** Mark complete for assigner or after all workers finished. */
export function markTaskCompletePatch(task: Task): Partial<Task> {
  if (!isRecurringTask(task)) {
    return { status: "done" };
  }
  const occ = listDisplayOccurrence(task);
  const patch = completeOccurrencePatch(task, occ.index);
  const merged = { ...task, ...patch };
  if (isFixedSeriesFullyCompleted(merged)) {
    return { ...patch, status: "done" };
  }
  return patch;
}
