import { Timestamp } from "firebase/firestore";
import type {
  ContactReminder,
  ContactStage,
  Person,
  SalesContact,
  Task,
  TaskPriority,
  TaskSector,
  TaskStatus,
} from "../types";
import { normalizeFeedbackRequests, taskHasOpenFeedback } from "../utils/taskFeedback";
import { normalizePersonTaskStats } from "../utils/personTaskStats";
import { normalizeTaskComments } from "../utils/taskComments";
import { normalizeOrgRole } from "../auth/roles";
import { TASK_SECTORS, normalizeDepartments } from "../types";
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

const STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];
const PRIOS: TaskPriority[] = ["low", "medium", "high", "urgent"];
const SECTOR_SET = new Set<string>(TASK_SECTORS);
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
  const sectorRaw = data.sector;
  const sector: TaskSector =
    typeof sectorRaw === "string" && SECTOR_SET.has(sectorRaw) ? (sectorRaw as TaskSector) : "general";
  const feedbackRequests = normalizeFeedbackRequests(data.feedbackRequests);
  const task: Task = {
    id: typeof data.id === "string" ? data.id : id,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    updates: sanitizeTaskUpdates(String(data.updates ?? "")),
    updatesByUser: normalizeUpdatesByUser(data.updatesByUser),
    comments: normalizeTaskComments(data.comments),
    assigneeIds: readAssigneeIds(data),
    assigneeDepartmentIds: normalizeAssigneeDepartments(data.assigneeDepartmentIds),
    finishedByIds: normalizeIdList(data.finishedByIds),
    feedbackByIds: normalizeIdList(data.feedbackByIds),
    feedbackRequests,
    assignedById: String(data.assignedById ?? ""),
    status,
    priority,
    sector,
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
  task.needsFeedback =
    taskHasOpenFeedback(task) ||
    Boolean(data.needsFeedback) ||
    normalizeIdList(data.feedbackByIds).length > 0;
  return task;
}

export function normalizeReminder(id: string, data: Record<string, unknown>): ContactReminder {
  return {
    id,
    title: String(data.title ?? ""),
    dueAt: toIso(data.dueAt),
    notes: String(data.notes ?? ""),
    done: Boolean(data.done),
  };
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
