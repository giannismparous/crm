import type { OrgRole } from "./auth/roles";

/** Aggregate task activity counters (Firestore `taskStats` on each person). */
export type PersonTaskStats = {
  /** Task reached done — credited to assignees; decreases on reopen. */
  tasksCompleted: number;
  /** Assigner used Mark complete — credited to assignees, not the clicker. */
  tasksFinishedMarked: number;
  feedbackRequested: number;
  feedbackGiven: number;
  tasksAssigned: number;
  tasksPostponed: number;
};

export type Person = {
  id: string;
  name: string;
  /** Job title shown on the team directory (not platform access). */
  title: string;
  email: string;
  /** Team / function areas — a member can belong to more than one. */
  departments: string[];
  /** Platform access role (founder or member). */
  orgRole: OrgRole;
  /** Set when this row is linked to Firebase Auth (bootstrap / profile sync) */
  authUid?: string;
  /** One-time seed used at registration, if any. */
  registrationSeedId?: string;
  registeredAt?: string;
  taskStats?: PersonTaskStats;
};

export type RegistrationSeed = {
  id: string;
  /** Privileges granted to the user who redeems this seed. */
  orgRole: OrgRole;
  issuedById: string;
  issuedByEmail: string;
  issuedAt: string;
  used: boolean;
  usedById?: string;
  usedByEmail?: string;
  usedAt?: string;
};

export function normalizeDepartments(value: unknown, legacySingle?: unknown): string[] {
  if (Array.isArray(value)) {
    const list = [...new Set(value.map((x) => String(x).trim()).filter(Boolean))];
    if (list.length > 0) return list;
  }
  const legacy = String(legacySingle ?? value ?? "").trim();
  return legacy ? [legacy] : [];
}

export function personDepartmentsLabel(departments: string[]): string {
  if (departments.length === 0) return "Unassigned";
  return departments.join(", ");
}

export function personSortKey(departments: string[], name: string): string {
  const primary = departments[0] ?? "";
  return `${primary}\0${name}`;
}

/** Default departments for the team directory — existing custom values are still shown in the UI. */
export const TEAM_DEPARTMENTS = [
  "Sales",
  "Marketing",
  "Product",
  "Engineering",
  "Operations",
  "Finance",
  "Legal",
  "General",
] as const;

export type TeamDepartment = (typeof TEAM_DEPARTMENTS)[number];

export const DEPARTMENT_CHIP_CLASS: Record<string, string> = {
  Sales: "bg-amber-400/35 text-amber-950 ring-1 ring-amber-500/40",
  Marketing: "bg-fuchsia-400/25 text-fuchsia-950 ring-1 ring-fuchsia-500/35",
  Product: "bg-violet-400/25 text-violet-950 ring-1 ring-violet-500/35",
  Engineering: "bg-sky-400/28 text-sky-950 ring-1 ring-sky-500/40",
  Operations: "bg-teal-400/28 text-teal-950 ring-1 ring-teal-500/40",
  Finance: "bg-emerald-400/25 text-emerald-950 ring-1 ring-emerald-500/35",
  Legal: "bg-slate-500/22 text-slate-900 ring-1 ring-slate-600/35",
  General: "bg-slate-400/22 text-slate-800 ring-1 ring-slate-500/35",
};

export function departmentChipClass(department: string): string {
  return DEPARTMENT_CHIP_CLASS[department] ?? "bg-slate-400/22 text-slate-800 ring-1 ring-slate-500/35";
}

export type TabId = "tasks" | "team" | "contacts" | "calendar";

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** Fixed list — stored on each task (e.g. sales vs product). */
export const TASK_SECTORS = [
  "sales",
  "marketing",
  "product",
  "operations",
  "finance",
  "legal",
  "general",
] as const;

export type TaskSector = (typeof TASK_SECTORS)[number];

export const TASK_SECTOR_LABELS: Record<TaskSector, string> = {
  sales: "Sales",
  marketing: "Marketing",
  product: "Product",
  operations: "Operations",
  finance: "Finance",
  legal: "Legal",
  general: "General",
};

/** Maps a task’s sector to team directory department labels (`Person.departments`). */
export function departmentLabelForTaskSector(sector: TaskSector): string {
  return TASK_SECTOR_LABELS[sector];
}

/** Translucent chip styles per sector (Tailwind). */
export const TASK_SECTOR_CHIP_CLASS: Record<TaskSector, string> = {
  sales: "bg-amber-400/35 text-amber-950 ring-1 ring-amber-500/40",
  marketing: "bg-fuchsia-400/25 text-fuchsia-950 ring-1 ring-fuchsia-500/35",
  product: "bg-violet-400/25 text-violet-950 ring-1 ring-violet-500/35",
  operations: "bg-teal-400/28 text-teal-950 ring-1 ring-teal-500/40",
  finance: "bg-emerald-400/25 text-emerald-950 ring-1 ring-emerald-500/35",
  legal: "bg-slate-500/22 text-slate-900 ring-1 ring-slate-600/35",
  general: "bg-slate-400/22 text-slate-800 ring-1 ring-slate-500/35",
};

export type CommentReactions = {
  likes: string[];
  dislikes: string[];
};

export type TaskComment = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  reactions?: CommentReactions;
};

/** Firestore sync for comment like/dislike notifications. */
export type CommentReactionNotifyChange =
  | { kind: "added"; vote: "like" | "dislike" }
  | { kind: "cleared" };

export type TaskFeedbackResponse = {
  personId: string;
  body: string;
  createdAt: string;
};

export type TaskFeedbackRequest = {
  id: string;
  requestedById: string;
  createdAt: string;
  notifyPersonIds: string[];
  notifyDepartmentIds: string[];
  /** People who were asked (resolved from picks at request time). */
  askedPersonIds: string[];
  responses: TaskFeedbackResponse[];
  status: "open" | "resolved";
  resolvedAt?: string;
};

export type NotificationKind =
  | "task_comment"
  | "mention_person"
  | "mention_department"
  | "task_feedback"
  | "task_feedback_reply"
  | "task_finished"
  | "task_postponed"
  | "task_created"
  | "task_marked_complete"
  | "task_reopened"
  | "comment_reaction";

/** Max notifications loaded per user (Firestore query limit). */
export const NOTIFICATION_INBOX_LIMIT = 50;

export type AppNotification = {
  id: string;
  recipientId: string;
  kind: NotificationKind;
  taskId: string;
  taskTitle: string;
  commentId: string;
  authorId: string;
  authorName: string;
  bodyPreview: string;
  /** Department name when kind is mention_department */
  mentionLabel?: string;
  read: boolean;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  /** Shared progress notes — simple HTML (bold, underline, highlight) */
  updates: string;
  /** @deprecated Legacy — all workers share `updates`; cleared on save */
  updatesByUser: Record<string, string>;
  /** Thread-style notes from anyone on the task */
  comments: TaskComment[];
  /** People responsible for the work — ids from org `people` in Firestore */
  assigneeIds: string[];
  /** Whole departments — any member can use I finished / I need feedback */
  assigneeDepartmentIds: string[];
  /** Person ids who marked I finished (used especially for department tasks) */
  finishedByIds: string[];
  /** Person ids who flagged I need feedback (open requests only, synced on save) */
  feedbackByIds: string[];
  /** Feedback threads — shown in comments area */
  feedbackRequests: TaskFeedbackRequest[];
  /** Who created / assigned the task */
  assignedById: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Team / function area */
  sector: TaskSector;
  /** Current due date (may move vs original) */
  dueDate: string;
  /** First agreed due date — if different from dueDate, UI shows “postponed” */
  originalDueDate: string;
  /** How many times the due date was pushed via Postpone (stored in Firestore). */
  postponeCount: number;
  needsFeedback: boolean;
  createdAt: string;
  /** Set when status becomes done (assigner mark complete or all workers finished). */
  completedAt?: string;
  canceledAt?: string;
  canceledById?: string;
};

/** Tasks list bucket in the Tasks tab. */
export type TaskListTab = "open" | "completed" | "canceled";

export type ContactStage =
  | "lead"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "customer"
  | "churned";

export type ContactReminder = {
  id: string;
  title: string;
  dueAt: string;
  notes: string;
  done: boolean;
};

export type SalesContact = {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  email: string;
  phone: string;
  website: string;
  stage: ContactStage;
  estimatedValue: number;
  currency: string;
  lastContactedAt: string;
  generalNotes: string;
  reminders: ContactReminder[];
};

export type TaskListScope = "my" | "everyone";
