import type { Firestore } from "firebase-admin/firestore";
import { ORG_ID, type CrmType } from "./constants";

export interface CrmTask {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: string;
  priority?: string;
  assigneeIds?: string[];
  assigneeDepartmentIds?: string[];
  assignedById?: string;
  projectId?: string;
}

export interface CrmAppointment {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  meetingLink?: string;
  status: string;
  participantIds?: string[];
  participantDepartmentIds?: string[];
  createdById?: string;
}

export interface CrmPersonalReminder {
  id: string;
  title: string;
  notes?: string;
  dueAt: string;
  done: boolean;
  ownerId: string;
  participantIds?: string[];
  participantDepartmentIds?: string[];
}

export interface CrmProject {
  id: string;
  departmentIds?: string[];
}

export async function loadCrmItem(
  db: Firestore,
  crmType: CrmType,
  crmId: string
): Promise<CrmTask | CrmAppointment | CrmPersonalReminder | null> {
  const collection =
    crmType === "task"
      ? "tasks"
      : crmType === "appointment"
        ? "appointments"
        : "personalReminders";
  const snap = await db.doc(`organizations/${ORG_ID}/${collection}/${crmId}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  return { id: snap.id, ...data } as CrmTask | CrmAppointment | CrmPersonalReminder;
}

export function userWantsSync(
  integration: { syncTasks: boolean; syncAppointments: boolean; syncReminders: boolean },
  crmType: CrmType
): boolean {
  if (crmType === "task") return integration.syncTasks;
  if (crmType === "appointment") return integration.syncAppointments;
  return integration.syncReminders;
}

export function shouldDeleteFromCalendar(
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder
): boolean {
  if (crmType === "task") {
    const task = item as CrmTask;
    return task.status === "done" || task.status === "canceled" || !task.dueDate?.trim();
  }
  if (crmType === "appointment") {
    return (item as CrmAppointment).status === "canceled";
  }
  const rem = item as CrmPersonalReminder;
  return rem.done || !rem.dueAt?.trim();
}
