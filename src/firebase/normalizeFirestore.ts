import { Timestamp } from "firebase/firestore";
import type {
  Appointment,
  AppointmentStatus,
  ContactReminder,
  ContactStage,
  PersonalReminder,
  Person,
  Project,
  ResearchItem,
  SalesContact,
  Task,
  TaskPriority,
  TaskStatus,
} from "../types";
import { normalizeOccurrenceRsvp } from "../utils/appointmentRsvp";
import { normalizeOccurrenceFieldsMap } from "../utils/appointmentOccurrenceFields";
import { normalizeReviewItems } from "../utils/appointmentReview";
import { normalizeRecurrenceRule } from "../utils/appointmentRecurrence";
import { normalizeFeedbackRequests, taskHasOpenFeedback } from "../utils/taskFeedback";
import { normalizePersonTaskStats } from "../utils/personTaskStats";
import { normalizeImageAttachments } from "../utils/imageAttachments";
import { normalizeTaskComments } from "../utils/taskComments";
import { normalizeTaskUpdateEntries } from "../utils/taskUpdateEntries";
import { normalizeOrgRole } from "../auth/roles";
import { normalizeDepartments } from "../types";
import { normalizeProjectColor } from "../utils/projectColors";
import {
  normalizeAssigneeDepartments,
  normalizeIdList,
} from "../utils/taskAssignees";
import { sanitizeTaskUpdates } from "../utils/sanitizeRichText";
import { normalizeUpdatesByUser } from "../utils/taskUpdates";

function isTimestamp(v: unknown): v is Timestamp {
  return v instanceof Timestamp;
}

export function toIso(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (isTimestamp(v)) return v.toDate().toISOString();
  return "";
}

function dateOnly(v: unknown): string {
  const s = toIso(v);
  return s.length >= 10 ? s.slice(0, 10) : "";
}

const STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done", "canceled"];
const PRIOS: TaskPriority[] = ["low", "medium", "high", "urgent"];
const STAGES: ContactStage[] = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "customer",
  "churned",
];

export function normalizePerson(id: string, data: Record<string, unknown>): Person {
  const p: Person = {
    id: typeof data.id === "string" ? data.id : id,
    name: String(data.name ?? ""),
    title: String(data.title ?? data.role ?? ""),
    email: String(data.email ?? ""),
    departments: normalizeDepartments(data.departments, data.department),
    orgRole: normalizeOrgRole(data.orgRole),
  };
  if (typeof data.authUid === "string" && data.authUid) p.authUid = data.authUid;
  if (typeof data.registrationSeedId === "string" && data.registrationSeedId) {
    p.registrationSeedId = data.registrationSeedId;
  }
  if (typeof data.registeredAt === "string" && data.registeredAt) {
    p.registeredAt = data.registeredAt;
  }
  if (data.profileSetupComplete === false) {
    p.profileSetupComplete = false;
  }
  const accountExpiresAt = toIso(data.accountExpiresAt);
  if (accountExpiresAt) p.accountExpiresAt = accountExpiresAt;
  const avatarUrl = String(data.avatarUrl ?? "").trim();
  if (avatarUrl) p.avatarUrl = avatarUrl;
  const avatarStoragePath = String(data.avatarStoragePath ?? "").trim();
  if (avatarStoragePath) p.avatarStoragePath = avatarStoragePath;
  p.taskStats = normalizePersonTaskStats(data.taskStats);
  return p;
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
}

function readAssigneeIds(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.assigneeIds)) {
    const fromArr = dedupeIds((data.assigneeIds as unknown[]).map((x) => String(x)));
    if (fromArr.length > 0) return fromArr;
  }
  const legacy = data.assigneeId;
  if (typeof legacy === "string" && legacy.trim()) return [legacy.trim()];
  return [];
}

export function normalizeProject(id: string, data: Record<string, unknown>): Project {
  const departmentIds = normalizeAssigneeDepartments(data.departmentIds);
  const project: Project = {
    id: typeof data.id === "string" ? data.id : id,
    name: String(data.name ?? "").trim(),
    description: String(data.description ?? "").trim(),
    color: normalizeProjectColor(data.color),
    completed: Boolean(data.completed),
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
  };
  if (departmentIds.length > 0) project.departmentIds = departmentIds;
  const completedAt = toIso(data.completedAt);
  if (completedAt) project.completedAt = completedAt;
  return project;
}

export function normalizeTask(id: string, data: Record<string, unknown>): Task {
  const status = STATUSES.includes(data.status as TaskStatus) ? (data.status as TaskStatus) : "todo";
  const priority = PRIOS.includes(data.priority as TaskPriority) ? (data.priority as TaskPriority) : "medium";
  const due = dateOnly(data.dueDate);
  const orig = dateOnly(data.originalDueDate) || due;
  const rawPc = data.postponeCount;
  let postponeCount = 0;
  if (typeof rawPc === "number" && Number.isFinite(rawPc) && rawPc >= 0) {
    postponeCount = Math.min(1000, Math.floor(rawPc));
  } else if (typeof rawPc === "string" && rawPc.trim() !== "" && Number.isFinite(Number(rawPc))) {
    const n = Math.floor(Number(rawPc));
    if (n >= 0) postponeCount = Math.min(1000, n);
  }
  if (postponeCount === 0 && due && orig && due !== orig) postponeCount = 1;
  const feedbackRequests = normalizeFeedbackRequests(data.feedbackRequests);
  const task: Task = {
    id: typeof data.id === "string" ? data.id : id,
    title: String(data.title ?? ""),
    description: sanitizeTaskUpdates(String(data.description ?? "")),
    updates: sanitizeTaskUpdates(String(data.updates ?? "")),
    updatesByUser: normalizeUpdatesByUser(data.updatesByUser),
    updateEntries: normalizeTaskUpdateEntries(data.updateEntries),
    comments: normalizeTaskComments(data.comments),
    assigneeIds: readAssigneeIds(data),
    assigneeDepartmentIds: normalizeAssigneeDepartments(data.assigneeDepartmentIds),
    finishedByIds: normalizeIdList(data.finishedByIds),
    feedbackByIds: normalizeIdList(data.feedbackByIds),
    feedbackRequests,
    assignedById: String(data.assignedById ?? ""),
    status,
    priority,
    dueDate: due,
    originalDueDate: orig,
    postponeCount,
    needsFeedback: false,
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
  };
  const completedAt = toIso(data.completedAt);
  if (completedAt) task.completedAt = completedAt;
  const canceledAt = toIso(data.canceledAt);
  if (canceledAt) task.canceledAt = canceledAt;
  const canceledById = String(data.canceledById ?? "").trim();
  if (canceledById) task.canceledById = canceledById;
  const projectId = String(data.projectId ?? "").trim();
  if (projectId) task.projectId = projectId;
  const appointmentId = String(data.appointmentId ?? "").trim();
  if (appointmentId) task.appointmentId = appointmentId;
  const recurrenceRule = normalizeRecurrenceRule(data.recurrenceRule);
  if (recurrenceRule) task.recurrenceRule = recurrenceRule;
  if (typeof data.recurrenceCount === "number" && Number.isFinite(data.recurrenceCount)) {
    task.recurrenceCount = data.recurrenceCount;
  }
  if (data.recurrenceOngoing === true) task.recurrenceOngoing = true;
  const recurrenceCanceledFrom = toIso(data.recurrenceCanceledFrom);
  if (recurrenceCanceledFrom) task.recurrenceCanceledFrom = recurrenceCanceledFrom;
  if (Array.isArray(data.canceledOccurrenceIndices)) {
    const indices = data.canceledOccurrenceIndices
      .map((v) => Math.floor(Number(v)))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (indices.length > 0) task.canceledOccurrenceIndices = [...new Set(indices)].sort((a, b) => a - b);
  }
  if (Array.isArray(data.completedOccurrenceIndices)) {
    const indices = data.completedOccurrenceIndices
      .map((v) => Math.floor(Number(v)))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (indices.length > 0) {
      task.completedOccurrenceIndices = [...new Set(indices)].sort((a, b) => a - b);
    }
  }
  task.needsFeedback =
    taskHasOpenFeedback(task) ||
    Boolean(data.needsFeedback) ||
    normalizeIdList(data.feedbackByIds).length > 0;
  return task;
}

export function normalizeReminder(id: string, data: Record<string, unknown>): ContactReminder {
  const attachments = normalizeImageAttachments(data.attachments);
  return {
    id,
    title: String(data.title ?? ""),
    dueAt: toIso(data.dueAt),
    notes: String(data.notes ?? ""),
    done: Boolean(data.done),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

export function normalizePersonalReminder(id: string, data: Record<string, unknown>): PersonalReminder {
  const attachments = normalizeImageAttachments(data.attachments);
  const reminder: PersonalReminder = {
    id: typeof data.id === "string" ? data.id : id,
    ownerId: String(data.ownerId ?? ""),
    title: String(data.title ?? ""),
    dueAt: toIso(data.dueAt),
    notes: String(data.notes ?? ""),
    done: Boolean(data.done),
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    participantIds: normalizeIdList(data.participantIds),
    participantDepartmentIds: normalizeAssigneeDepartments(data.participantDepartmentIds),
  };
  const contactId = String(data.contactId ?? "").trim();
  if (contactId) reminder.contactId = contactId;
  const taskId = String(data.taskId ?? "").trim();
  if (taskId) reminder.taskId = taskId;
  const appointmentId = String(data.appointmentId ?? "").trim();
  if (appointmentId) reminder.appointmentId = appointmentId;
  if (attachments.length > 0) reminder.attachments = attachments;
  if (Array.isArray(data.dueNotifyFired)) {
    const slots = [...new Set((data.dueNotifyFired as unknown[]).map((x) => String(x).trim()).filter(Boolean))];
    if (slots.length > 0) reminder.dueNotifyFired = slots;
  }
  return reminder;
}

const APPOINTMENT_STATUSES: AppointmentStatus[] = ["scheduled", "canceled"];

export function normalizeAppointment(id: string, data: Record<string, unknown>): Appointment {
  const status = APPOINTMENT_STATUSES.includes(data.status as AppointmentStatus)
    ? (data.status as AppointmentStatus)
    : "scheduled";
  const apt: Appointment = {
    id: typeof data.id === "string" ? data.id : id,
    title: String(data.title ?? ""),
    startsAt: toIso(data.startsAt),
    location: String(data.location ?? ""),
    participantIds: normalizeIdList(data.participantIds),
    participantDepartmentIds: normalizeAssigneeDepartments(data.participantDepartmentIds),
    createdById: String(data.createdById ?? ""),
    status,
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
  };
  const description = String(data.description ?? "").trim();
  if (description) apt.description = description;
  const meetingLink = String(data.meetingLink ?? "").trim();
  if (meetingLink) apt.meetingLink = meetingLink;
  const endsAt = toIso(data.endsAt);
  if (endsAt) apt.endsAt = endsAt;
  const canceledAt = toIso(data.canceledAt);
  if (canceledAt) apt.canceledAt = canceledAt;
  const attachments = normalizeImageAttachments(data.attachments);
  if (attachments.length > 0) apt.attachments = attachments;
  const taskId = String(data.taskId ?? "").trim();
  if (taskId) apt.taskId = taskId;
  const reviewItems = normalizeReviewItems(data);
  if (reviewItems.length > 0) apt.reviewItems = reviewItems;
  const linkedTaskIds = normalizeIdList(data.linkedTaskIds);
  if (linkedTaskIds.length > 0) apt.linkedTaskIds = linkedTaskIds;
  const recurrenceSeriesId = String(data.recurrenceSeriesId ?? "").trim();
  if (recurrenceSeriesId) apt.recurrenceSeriesId = recurrenceSeriesId;
  if (typeof data.recurrenceIndex === "number" && Number.isFinite(data.recurrenceIndex)) {
    apt.recurrenceIndex = data.recurrenceIndex;
  }
  const recurrenceRule = normalizeRecurrenceRule(data.recurrenceRule);
  if (recurrenceRule) apt.recurrenceRule = recurrenceRule;
  if (typeof data.recurrenceCount === "number" && Number.isFinite(data.recurrenceCount)) {
    apt.recurrenceCount = data.recurrenceCount;
  }
  if (data.recurrenceOngoing === true) apt.recurrenceOngoing = true;
  const recurrenceCanceledFrom = toIso(data.recurrenceCanceledFrom);
  if (recurrenceCanceledFrom) apt.recurrenceCanceledFrom = recurrenceCanceledFrom;
  if (Array.isArray(data.canceledOccurrenceIndices)) {
    const indices = data.canceledOccurrenceIndices
      .map((v) => Math.floor(Number(v)))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (indices.length > 0) apt.canceledOccurrenceIndices = [...new Set(indices)].sort((a, b) => a - b);
  }
  const occurrenceRsvp = normalizeOccurrenceRsvp(data.occurrenceRsvp);
  if (occurrenceRsvp) apt.occurrenceRsvp = occurrenceRsvp;
  const occurrenceFields = normalizeOccurrenceFieldsMap(data.occurrenceFields);
  if (occurrenceFields) apt.occurrenceFields = occurrenceFields;
  return apt;
}

export function normalizeContact(
  id: string,
  data: Record<string, unknown>,
  reminders: ContactReminder[]
): SalesContact {
  const stage = STAGES.includes(data.stage as ContactStage) ? (data.stage as ContactStage) : "lead";
  return {
    id: typeof data.id === "string" ? data.id : id,
    firstName: String(data.firstName ?? ""),
    lastName: String(data.lastName ?? ""),
    company: String(data.company ?? ""),
    jobTitle: String(data.jobTitle ?? ""),
    email: String(data.email ?? ""),
    phone: String(data.phone ?? ""),
    website: String(data.website ?? ""),
    stage,
    estimatedValue: typeof data.estimatedValue === "number" ? data.estimatedValue : Number(data.estimatedValue) || 0,
    currency: String(data.currency ?? "EUR"),
    lastContactedAt: toIso(data.lastContactedAt),
    generalNotes: String(data.generalNotes ?? ""),
    reminders,
  };
}

export function normalizeResearchItem(id: string, data: Record<string, unknown>): ResearchItem {
  const item: ResearchItem = {
    id: typeof data.id === "string" ? data.id : id,
    title: String(data.title ?? "").trim(),
    notes: String(data.notes ?? ""),
    createdById: String(data.createdById ?? ""),
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    updatedAt: toIso(data.updatedAt) || toIso(data.createdAt) || new Date().toISOString(),
  };
  const attachments = normalizeImageAttachments(data.attachments);
  if (attachments.length > 0) item.attachments = attachments;
  return item;
}
