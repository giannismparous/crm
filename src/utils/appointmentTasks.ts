import type { Appointment, Task } from "../types";
import { isTaskOpen } from "./personTaskStats";

/** All tasks linked to an appointment (including completed/canceled). */
export function tasksLinkedToAppointment(apt: Appointment, allTasks: Task[]): Task[] {
  const explicit = [...new Set((apt.linkedTaskIds ?? []).map((x) => x.trim()).filter(Boolean))];
  if (explicit.length > 0) {
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    return explicit.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t));
  }
  const byLink = allTasks.filter((t) => t.appointmentId === apt.id);
  const seen = new Set(byLink.map((t) => t.id));
  if (apt.taskId && !seen.has(apt.taskId)) {
    const legacy = allTasks.find((t) => t.id === apt.taskId);
    if (legacy) return [legacy, ...byLink];
  }
  return byLink;
}

/** Open tasks only — for read-only appointment UI. */
export function openTasksForAppointment(apt: Appointment, allTasks: Task[]): Task[] {
  return tasksLinkedToAppointment(apt, allTasks).filter((t) => isTaskOpen(t));
}

export function linkedOpenTaskIdsForAppointment(apt: Appointment, allTasks: Task[]): string[] {
  return openTasksForAppointment(apt, allTasks).map((t) => t.id);
}
