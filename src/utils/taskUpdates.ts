import type { Person, Task } from "../types";
import { getTaskWorkerIds } from "./taskAssignees";
import { sanitizeTaskUpdates, taskUpdatesToPlainText } from "./sanitizeRichText";

export function taskUsesMultiAuthorUpdates(task: Task, people: Person[]): boolean {
  return getTaskWorkerIds(task, people).length >= 2;
}

export function normalizeUpdatesByUser(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const id = k.trim();
    if (!id || typeof v !== "string") continue;
    const safe = sanitizeTaskUpdates(v);
    if (safe) out[id] = safe;
  }
  return out;
}

function mergedFromByUser(task: Task, people: Person[]): string {
  const byUser = normalizeUpdatesByUser(task.updatesByUser);
  const workers = getTaskWorkerIds(task, people);
  return workers
    .map((id) => byUser[id]?.trim())
    .filter(Boolean)
    .map((html) => sanitizeTaskUpdates(html))
    .join("<br><br>");
}

/** Single shared updates body (migrates legacy per-user map into one string). */
export function taskUpdatesContent(task: Task, people: Person[]): string {
  const direct = sanitizeTaskUpdates(task.updates);
  if (direct) return direct;
  return mergedFromByUser(task, people);
}

export function taskUpdatesHasContent(task: Task, people: Person[]): boolean {
  return taskUpdatesContent(task, people).trim().length > 0;
}

export function mergedTaskUpdatesPlainText(task: Task, people: Person[]): string {
  return taskUpdatesToPlainText(taskUpdatesContent(task, people));
}
