import type { Person, Task } from "../types";
import { TEAM_DEPARTMENTS } from "../types";

const DEPT_SET = new Set<string>(TEAM_DEPARTMENTS);

export function normalizeAssigneeDepartments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x).trim()).filter((d) => DEPT_SET.has(d)))];
}

export function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x).trim()).filter(Boolean))];
}

/** Everyone who should see / act on this task (direct assignees + members of assigned departments). */
export function getTaskWorkerIds(task: Task, people: Person[]): string[] {
  const ids = new Set(task.assigneeIds);
  for (const dept of task.assigneeDepartmentIds) {
    for (const p of people) {
      if (p.departments.includes(dept)) ids.add(p.id);
    }
  }
  return [...ids];
}

/** Unique people for avatar stack: direct assignees, then dept members not already listed. */
export function assigneeAvatarPeople(
  assigneeIds: string[],
  assigneeDepartmentIds: string[],
  people: Person[]
): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const id of assigneeIds) {
    if (seen.has(id)) continue;
    const person = people.find((p) => p.id === id);
    if (!person) continue;
    seen.add(id);
    out.push(person);
  }
  for (const dept of assigneeDepartmentIds) {
    for (const person of people) {
      if (!person.departments.includes(dept) || seen.has(person.id)) continue;
      seen.add(person.id);
      out.push(person);
    }
  }
  return out;
}

/** True when the task is shared by more than one worker (multiple assignees and/or a dept with 2+ members). */
export function taskHasMultipleWorkers(task: Task, people: Person[]): boolean {
  return getTaskWorkerIds(task, people).length > 1;
}

/** Show “(self assigned)” when the only worker has no assigner or assigned the task to themselves. */
export function isSelfAssignedSingleWorkerTask(task: Task, people: Person[]): boolean {
  const workers = getTaskWorkerIds(task, people);
  if (workers.length !== 1) return false;
  const soleId = workers[0]!;
  if (!task.assignedById) return true;
  return task.assignedById === soleId;
}

export function isTaskWorker(task: Task, personId: string, people: Person[]): boolean {
  if (!personId) return false;
  return getTaskWorkerIds(task, people).includes(personId);
}

export function taskInvolvesPerson(task: Task, personId: string, people: Person[]): boolean {
  return task.assignedById === personId || isTaskWorker(task, personId, people);
}

export function personHasFeedback(task: Task, personId: string): boolean {
  return task.feedbackByIds.includes(personId);
}

export function taskHasAnyFeedback(task: Task): boolean {
  return task.needsFeedback || task.feedbackByIds.length > 0;
}

export function allWorkersFinished(task: Task, people: Person[]): boolean {
  const workers = getTaskWorkerIds(task, people);
  if (workers.length === 0) return false;
  return workers.every((id) => task.finishedByIds.includes(id));
}

/**
 * Worker confirmed I/We finished.
 * Solo assignee → marks done immediately.
 * Multiple workers (or dept with 2+) → “We finished” marks the whole assignee group done.
 */
/** Clear completion and worker-finished flags when reopening a done task. */
export function reopenTaskPatch(): Pick<Task, "finishedByIds" | "status"> {
  return { status: "todo", finishedByIds: [] };
}

export function submitWorkerFinished(
  task: Task,
  personId: string,
  people: Person[]
): Pick<Task, "finishedByIds" | "status"> {
  const workers = getTaskWorkerIds(task, people);
  const multi = taskHasMultipleWorkers(task, people);

  const finishedByIds = multi
    ? [...new Set([...task.finishedByIds, ...workers])]
    : [...new Set([...task.finishedByIds, personId])];

  const allDone =
    workers.length === 0
      ? finishedByIds.includes(personId)
      : workers.every((id) => finishedByIds.includes(id));

  return {
    finishedByIds,
    status: allDone ? "done" : task.status,
  };
}

export function toggleWorkerFinished(
  task: Task,
  personId: string,
  people: Person[]
): Pick<Task, "finishedByIds" | "status"> {
  const workers = getTaskWorkerIds(task, people);
  let finishedByIds = [...task.finishedByIds];
  if (finishedByIds.includes(personId)) {
    finishedByIds = finishedByIds.filter((id) => id !== personId);
  } else {
    finishedByIds = [...finishedByIds, personId];
  }
  const status =
    workers.length > 0 && workers.every((id) => finishedByIds.includes(id))
      ? "done"
      : task.status === "done"
        ? "in_progress"
        : task.status;
  return { finishedByIds, status };
}

export function toggleWorkerFeedback(
  task: Task,
  personId: string
): Pick<Task, "feedbackByIds" | "needsFeedback"> {
  let feedbackByIds = [...task.feedbackByIds];
  if (feedbackByIds.includes(personId)) {
    feedbackByIds = feedbackByIds.filter((id) => id !== personId);
  } else {
    feedbackByIds = [...feedbackByIds, personId];
  }
  return { feedbackByIds, needsFeedback: feedbackByIds.length > 0 };
}

export function markWorkerNeedsFeedback(
  task: Task,
  personId: string
): Pick<Task, "feedbackByIds" | "needsFeedback"> {
  const feedbackByIds = task.feedbackByIds.includes(personId)
    ? [...task.feedbackByIds]
    : [...task.feedbackByIds, personId];
  return { feedbackByIds, needsFeedback: true };
}
