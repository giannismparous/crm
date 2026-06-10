import type { Person, Task, TaskUpdateEntry } from "../types";
import { getTaskWorkerIds } from "./taskAssignees";
import { authorIdsInUpdates, sanitizeTaskUpdates, taskUpdatesToPlainText } from "./sanitizeRichText";
import { normalizeUpdatesByUser } from "./taskUpdates";

export const TASK_UPDATE_EXPAND_EVENT = "crm-expand-task-update";

export function sanitizeUpdateTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
}

function inferLegacyUpdateAuthorId(task: Task, people: Person[], html: string): string {
  const fromSpans = authorIdsInUpdates(html);
  if (fromSpans.length === 1) return fromSpans[0]!;
  const workers = getTaskWorkerIds(task, people);
  if (workers.length === 1) return workers[0]!;
  return task.assignedById.trim() || workers[0] || "";
}

function legacyUpdatesHtml(task: Task, people: Person[]): string {
  const direct = sanitizeTaskUpdates(task.updates);
  if (direct) return direct;
  const byUser = normalizeUpdatesByUser(task.updatesByUser);
  const workers = getTaskWorkerIds(task, people);
  return workers
    .map((id) => byUser[id]?.trim())
    .filter(Boolean)
    .map((html) => sanitizeTaskUpdates(html))
    .join("<br><br>");
}

export function normalizeTaskUpdateEntries(value: unknown): TaskUpdateEntry[] {
  if (!Array.isArray(value)) return [];
  const out: TaskUpdateEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const authorId = typeof row.authorId === "string" ? row.authorId.trim() : "";
    const body = sanitizeTaskUpdates(typeof row.body === "string" ? row.body : "");
    const createdAt = typeof row.createdAt === "string" ? row.createdAt : "";
    const titleRaw = typeof row.title === "string" ? sanitizeUpdateTitle(row.title) : "";
    if (!id || !authorId || !createdAt || !body.trim()) continue;
    out.push({
      id,
      authorId,
      body,
      createdAt,
      ...(titleRaw ? { title: titleRaw } : {}),
    });
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

export function taskUpdateEntriesForFirestore(entries: TaskUpdateEntry[]): Record<string, unknown>[] {
  return entries.map((e) => ({
    id: e.id,
    authorId: e.authorId,
    body: e.body,
    createdAt: e.createdAt,
    ...(e.title?.trim() ? { title: e.title.trim() } : {}),
  }));
}

/** All updates for a task — migrates legacy `updates` / `updatesByUser` into one entry when needed. */
export function taskUpdateEntries(task: Task, people: Person[]): TaskUpdateEntry[] {
  const stored = normalizeTaskUpdateEntries(task.updateEntries);
  if (stored.length > 0) return stored;

  const legacy = legacyUpdatesHtml(task, people);
  if (!legacy.trim()) return [];

  return [
    {
      id: `legacy-${task.id}`,
      authorId: inferLegacyUpdateAuthorId(task, people, legacy),
      body: legacy,
      createdAt: task.completedAt ?? task.createdAt,
    },
  ];
}

export function taskUpdatesHasContent(task: Task, people: Person[]): boolean {
  return taskUpdateEntries(task, people).length > 0;
}

export function mergedTaskUpdatesPlainText(task: Task, people: Person[]): string {
  return taskUpdateEntries(task, people)
    .map((e) => [e.title?.trim(), taskUpdatesToPlainText(e.body)].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" ");
}

/** Person ids who actually wrote content in this update body (not task assignees). */
export function updateContributorIds(entry: Pick<TaskUpdateEntry, "authorId" | "body">): string[] {
  const fromBody = authorIdsInUpdates(entry.body);
  if (fromBody.length > 0) return fromBody;
  const body = sanitizeTaskUpdates(entry.body).trim();
  const authorId = entry.authorId.trim();
  if (body && authorId) return [authorId];
  return [];
}

export function updateContributors(
  entry: Pick<TaskUpdateEntry, "authorId" | "body">,
  people: Person[]
): Person[] {
  return updateContributorIds(entry)
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p));
}

export function updateMentionLabel(index: number): string {
  return `Update #${index + 1}`;
}

export function updateMentionLabels(task: Task, people: Person[]): { id: string; label: string }[] {
  return taskUpdateEntries(task, people).map((entry, index) => ({
    id: entry.id,
    label: updateMentionLabel(index),
  }));
}

export function updatePreviewPlain(entry: Pick<TaskUpdateEntry, "body" | "title">, maxLen = 48): string {
  const title = entry.title?.trim() ?? "";
  const plain = taskUpdatesToPlainText(entry.body).replace(/\s+/g, " ").trim();
  const combined = title && plain ? `${title} — ${plain}` : title || plain;
  if (!combined) return "Media update";
  if (combined.length <= maxLen) return combined;
  return `${combined.slice(0, maxLen).trimEnd()}…`;
}

export function appendTaskUpdate(
  task: Task,
  people: Person[],
  authorId: string,
  body: string,
  title = ""
): TaskUpdateEntry[] {
  const safe = sanitizeTaskUpdates(body);
  if (!safe.trim()) return taskUpdateEntries(task, people);
  const safeTitle = sanitizeUpdateTitle(title);
  const entry: TaskUpdateEntry = {
    id: crypto.randomUUID(),
    authorId,
    body: safe,
    createdAt: new Date().toISOString(),
    ...(safeTitle ? { title: safeTitle } : {}),
  };
  return [...taskUpdateEntries(task, people), entry];
}
