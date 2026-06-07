import type { Person, Task } from "../types";
import { getTaskWorkerIds } from "./taskAssignees";

/** How a task_finished notification should read for this recipient. */
export type TaskFinishedNotifyRole = "assigner" | "worker" | "org";

/** Resolve unique person ids from explicit picks and/or whole departments. */
export function recipientIdsFromSelection(
  people: Person[],
  personIds: string[],
  departments: string[],
  excludeIds: string[] = []
): string[] {
  const ids = new Set<string>();
  for (const id of personIds) {
    if (id.trim()) ids.add(id);
  }
  for (const dept of departments) {
    for (const p of people) {
      if (p.departments.includes(dept)) ids.add(p.id);
    }
  }
  for (const id of excludeIds) ids.delete(id);
  return [...ids];
}

/** Everyone in the org except one person (e.g. broadcast task events). */
export function everyoneElsePersonIds(people: Person[], exceptId: string): string[] {
  return people.map((p) => p.id).filter((id) => id && id !== exceptId);
}

/** Everyone except the finisher, with a role for personalized notification copy. */
export function taskFinishedNotifyRecipients(
  task: Task,
  actorId: string,
  people: Person[]
): { recipientId: string; role: TaskFinishedNotifyRole }[] {
  const assignerId = task.assignedById && task.assignedById !== actorId ? task.assignedById : null;
  const workerIds = new Set(getTaskWorkerIds(task, people).filter((id) => id !== actorId));

  return everyoneElsePersonIds(people, actorId).map((recipientId) => {
    if (recipientId === assignerId) return { recipientId, role: "assigner" as const };
    if (workerIds.has(recipientId)) return { recipientId, role: "worker" as const };
    return { recipientId, role: "org" as const };
  });
}

/** Direct assignees and members of assigned departments. */
export function recipientsForNewTask(task: Task, people: Person[], creatorId: string): string[] {
  const workers = getTaskWorkerIds(task, people);
  const s = new Set<string>();
  for (const id of workers) if (id) s.add(id);
  s.delete(creatorId);
  return [...s];
}
