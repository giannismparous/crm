import type { Person, PersonTaskStats, Task } from "../types";
import { getTaskWorkerIds } from "./taskAssignees";

export type TaskUpdateIntent =
  | "mark_complete"
  | "reopen"
  | "postpone"
  | "feedback_request"
  | "feedback_given";

export const EMPTY_PERSON_TASK_STATS: PersonTaskStats = {
  tasksCompleted: 0,
  tasksFinishedMarked: 0,
  feedbackRequested: 0,
  feedbackGiven: 0,
  tasksAssigned: 0,
  tasksPostponed: 0,
};

export function normalizePersonTaskStats(value: unknown): PersonTaskStats {
  const base = { ...EMPTY_PERSON_TASK_STATS };
  if (!value || typeof value !== "object") return base;
  const o = value as Record<string, unknown>;
  const read = (key: keyof PersonTaskStats) => {
    const n = o[key];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.min(1_000_000, Math.floor(n));
    if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) {
      const v = Math.floor(Number(n));
      return v >= 0 ? Math.min(1_000_000, v) : 0;
    }
    return 0;
  };
  return {
    tasksCompleted: read("tasksCompleted"),
    tasksFinishedMarked: read("tasksFinishedMarked"),
    feedbackRequested: read("feedbackRequested"),
    feedbackGiven: read("feedbackGiven"),
    tasksAssigned: read("tasksAssigned"),
    tasksPostponed: read("tasksPostponed"),
  };
}

export function isTaskCanceled(task: Task): boolean {
  return task.status === "canceled";
}

export function isTaskCompleted(task: Task): boolean {
  return task.status === "done";
}

export function isTaskOpen(task: Task): boolean {
  return !isTaskCompleted(task) && !isTaskCanceled(task);
}

function countFeedbackResponses(task: Task): number {
  return (task.feedbackRequests ?? []).reduce((n, r) => n + r.responses.length, 0);
}

/** Person id → numeric deltas to apply with Firestore increment. */
export function computePersonStatDeltas(
  before: Task,
  after: Task,
  people: Person[],
  options?: { intent?: TaskUpdateIntent; actorId?: string }
): Map<string, Partial<PersonTaskStats>> {
  const deltas = new Map<string, Partial<PersonTaskStats>>();

  function add(personId: string, field: keyof PersonTaskStats, delta: number) {
    if (!personId || delta === 0) return;
    const row = deltas.get(personId) ?? {};
    row[field] = (row[field] ?? 0) + delta;
    deltas.set(personId, row);
  }

  const workersBefore = getTaskWorkerIds(before, people);
  const workersAfter = getTaskWorkerIds(after, people);
  const wasDone = isTaskCompleted(before);
  const isDone = isTaskCompleted(after);

  if (!wasDone && isDone) {
    for (const id of workersAfter) add(id, "tasksCompleted", 1);
    if (options?.intent === "mark_complete") {
      for (const id of workersAfter) add(id, "tasksFinishedMarked", 1);
    }
  } else if (wasDone && !isDone && options?.intent === "reopen") {
    for (const id of workersBefore) add(id, "tasksCompleted", -1);
  }

  if (after.postponeCount > before.postponeCount && options?.actorId) {
    add(options.actorId, "tasksPostponed", 1);
  }

  const reqBefore = before.feedbackRequests?.length ?? 0;
  const reqAfter = after.feedbackRequests?.length ?? 0;
  if (reqAfter > reqBefore) {
    const latest = after.feedbackRequests![reqAfter - 1];
    if (latest?.requestedById) add(latest.requestedById, "feedbackRequested", 1);
  }

  const respBefore = countFeedbackResponses(before);
  const respAfter = countFeedbackResponses(after);
  if (respAfter > respBefore) {
    const giverId = findNewFeedbackResponder(before, after) ?? options?.actorId;
    if (giverId) add(giverId, "feedbackGiven", 1);
  }

  return deltas;
}

function findNewFeedbackResponder(before: Task, after: Task): string | null {
  const beforeIds = new Set<string>();
  for (const r of before.feedbackRequests ?? []) {
    for (const res of r.responses) beforeIds.add(`${r.id}\0${res.personId}\0${res.createdAt}`);
  }
  for (const r of after.feedbackRequests ?? []) {
    for (const res of r.responses) {
      const key = `${r.id}\0${res.personId}\0${res.createdAt}`;
      if (!beforeIds.has(key)) return res.personId;
    }
  }
  return null;
}

export function statDeltaForNewTask(assignedById: string): Map<string, Partial<PersonTaskStats>> {
  const deltas = new Map<string, Partial<PersonTaskStats>>();
  if (assignedById) deltas.set(assignedById, { tasksAssigned: 1 });
  return deltas;
}

export function personStatsLabel(field: keyof PersonTaskStats): string {
  const labels: Record<keyof PersonTaskStats, string> = {
    tasksCompleted: "Tasks completed",
    tasksFinishedMarked: "Marked finished (assignee)",
    feedbackRequested: "Feedback requested",
    feedbackGiven: "Feedback given",
    tasksAssigned: "Tasks assigned",
    tasksPostponed: "Postponed",
  };
  return labels[field];
}
