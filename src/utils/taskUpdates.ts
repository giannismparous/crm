import type { Person, Task } from "../types";
import { getTaskWorkerIds } from "./taskAssignees";
import { sanitizeTaskUpdates } from "./sanitizeRichText";
import {
  appendTaskUpdate,
  mergedTaskUpdatesPlainText,
  taskUpdateEntries,
  taskUpdatesHasContent,
  updateContributorIds,
  updateContributors,
  updateMentionLabel,
  updateMentionLabels,
  updatePreviewPlain,
} from "./taskUpdateEntries";

export {
  appendTaskUpdate,
  mergedTaskUpdatesPlainText,
  taskUpdateEntries,
  taskUpdatesHasContent,
  updateContributorIds,
  updateContributors,
  updateMentionLabel,
  updateMentionLabels,
  updatePreviewPlain,
};

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

/** Legacy helper — concatenated HTML of all update entries. */
export function taskUpdatesContent(task: Task, people: Person[]): string {
  return taskUpdateEntries(task, people)
    .map((e) => e.body)
    .join("<br><br>");
}

export function taskDescriptionContent(task: Task): string {
  return sanitizeTaskUpdates(task.description ?? "");
}
