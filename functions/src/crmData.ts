import type { Firestore } from "firebase-admin/firestore";
import { ORG_ID, ORG_TIMEZONE, type CrmType } from "./constants";
import {
  expandCrmAppointmentOccurrences,
  expandCrmTaskOccurrences,
  isRecurringCrmAppointment,
  isRecurringCrmTask,
  lastPastOccurrenceEndBefore,
  lastPastTaskOccurrenceDueBefore,
} from "./recurrenceRrule";

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
  appointmentId?: string;
  recurrenceRule?: { kind: string; interval: number; dayOfMonth?: number };
  recurrenceCount?: number;
  recurrenceCanceledFrom?: string;
  recurrenceOngoing?: boolean;
  canceledOccurrenceIndices?: number[];
  completedOccurrenceIndices?: number[];
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
  reviewItems?: string[];
  taskId?: string;
  linkedTaskIds?: string[];
  recurrenceRule?: { kind: string; interval: number; dayOfMonth?: number };
  recurrenceCount?: number;
  recurrenceCanceledFrom?: string;
  recurrenceOngoing?: boolean;
  recurrenceSeriesId?: string;
  recurrenceIndex?: number;
  canceledOccurrenceIndices?: number[];
  occurrenceRsvp?: Record<string, Record<string, "yes" | "no">>;
  occurrenceFields?: Record<string, {
    location?: string;
    meetingLink?: string;
    description?: string;
    reviewItems?: string[];
  }>;
  projectId?: string;
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
  contactId?: string;
  taskId?: string;
  appointmentId?: string;
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

/** Remove from Google Calendar entirely (completed tasks, done reminders, missing dates). */
export function shouldRemoveFromCalendar(
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder
): boolean {
  if (crmType === "task") {
    const task = item as CrmTask;
    return task.status === "done" || !task.dueDate?.trim();
  }
  if (crmType === "appointment") {
    return !(item as CrmAppointment).startsAt?.trim();
  }
  const rem = item as CrmPersonalReminder;
  return rem.done || !rem.dueAt?.trim();
}

/** @deprecated use shouldRemoveFromCalendar — canceled items stay on calendar with CANCELED title */
export function shouldDeleteFromCalendar(
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder
): boolean {
  return shouldRemoveFromCalendar(crmType, item);
}

const orgDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIMEZONE });

/** Calendar date key (YYYY-MM-DD) for "now" in the org timezone. */
export function orgTodayDateKey(): string {
  return orgDateFormatter.format(new Date());
}

function isoDateKeyInOrgTz(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return orgDateFormatter.format(d);
}

/** True when the item's start/due is today or later in the org timezone. */
export function itemOnOrAfterToday(
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder
): boolean {
  const today = orgTodayDateKey();
  if (crmType === "task") {
    const due = (item as CrmTask).dueDate?.trim().slice(0, 10);
    return Boolean(due && due >= today);
  }
  const iso =
    crmType === "appointment"
      ? (item as CrmAppointment).startsAt?.trim()
      : (item as CrmPersonalReminder).dueAt?.trim();
  if (!iso) return false;
  const key = isoDateKeyInOrgTz(iso);
  return Boolean(key && key >= today);
}

/** Item should appear on Google Calendar for this user right now (today onward in org TZ). */
export function shouldSyncItemToCalendar(
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder,
  _options: { fromTodayOnly?: boolean } = {}
): boolean {
  if (shouldRemoveFromCalendar(crmType, item)) return false;

  if (crmType === "task") {
    const task = item as CrmTask;
    if (isRecurringCrmTask(task)) {
      if (task.status === "canceled") return false;
      if (task.recurrenceCanceledFrom) {
        return Boolean(lastPastTaskOccurrenceDueBefore(task, task.recurrenceCanceledFrom));
      }
      const today = orgTodayDateKey();
      const occs = expandCrmTaskOccurrences(task);
      return occs.some((o) => o.dueDate >= today);
    }
  }

  if (crmType === "appointment") {
    const apt = item as CrmAppointment;
    if (isRecurringCrmAppointment(apt)) {
      if (apt.recurrenceCanceledFrom) {
        return Boolean(lastPastOccurrenceEndBefore(apt, apt.recurrenceCanceledFrom));
      }
      if (apt.status === "canceled") return false;
      const today = orgTodayDateKey();
      const occs = expandCrmAppointmentOccurrences(apt);
      return occs.some((o) => {
        const key = isoDateKeyInOrgTz(o.startsAt);
        return Boolean(key && key >= today);
      });
    }
  }

  // Only upcoming items stay on Google Calendar. Past items are removed on sync — including
  // canceled tasks/meetings. Cancel/reopen only affects today+ events.
  return itemOnOrAfterToday(crmType, item);
}
