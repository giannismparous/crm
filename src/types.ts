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
  /** Platform access role (founder or partner). */
  orgRole: OrgRole;
  /** Set when this row is linked to Firebase Auth (bootstrap / profile sync) */
  authUid?: string;
  /** One-time seed used at registration, if any. */
  registrationSeedId?: string;
  registeredAt?: string;
  taskStats?: PersonTaskStats;
  /** Firebase Storage download URL for profile photo (self-uploaded). */
  avatarUrl?: string;
  /** Storage object path — used to replace or delete the photo. */
  avatarStoragePath?: string;
  /** False after seed registration until the user completes the profile setup screen. */
  profileSetupComplete?: boolean;
  /** Partners only — ISO datetime when platform access ends. */
  accountExpiresAt?: string;
};

export type RegistrationSeed = {
  id: string;
  /** Privileges granted to the user who redeems this seed. */
  orgRole: OrgRole;
  /** Departments assigned when the seed is redeemed — set by the admin issuing the seed. */
  departments: string[];
  issuedById: string;
  issuedByEmail: string;
  issuedAt: string;
  /** How long the code stays valid (1–7 days). */
  validDays: number;
  /** ISO datetime after which the code cannot be redeemed. */
  expiresAt: string;
  /** Partners only — months of account access granted on redeem. */
  accountValidMonths?: number;
  used: boolean;
  usedById?: string;
  usedByEmail?: string;
  usedAt?: string;
};

export type CreateRegistrationSeedInput = {
  orgRole: OrgRole;
  departments: string[];
  validDays: number;
  accountValidMonths?: number;
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

/** Departments on a registration seed — must be known team departments; defaults to General for partners. */
export function normalizeSeedDepartments(
  departments: string[],
  opts?: { requireAtLeastOne?: boolean }
): string[] {
  const allowed = new Set<string>(TEAM_DEPARTMENTS);
  const list = [...new Set(departments.map((d) => d.trim()).filter((d) => allowed.has(d)))];
  if (list.length > 0) return list;
  if (opts?.requireAtLeastOne) return ["General"];
  return [];
}

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

export type TabId =
  | "tasks"
  | "projects"
  | "appointments"
  | "team"
  | "contacts"
  | "reminders"
  | "messages"
  | "calendar";

export type ChatConversationKind = "founders" | "dm" | "group";

export type ChatConversation = {
  id: string;
  kind: ChatConversationKind;
  /** Person ids (Firebase Auth uids) in this conversation */
  memberIds: string[];
  createdById: string;
  createdAt: string;
  /** Group display name — omitted for DM / founders channel */
  title?: string;
  /** Sorted member ids joined — DM dedup key */
  dmKey?: string;
  /** Explicit people picked when the group was created (excludes creator). */
  participantIds?: string[];
  /** Departments picked when the group was created. */
  departmentIds?: string[];
  /** Dedup key from participantIds + departmentIds — group reuse */
  groupKey?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageAuthorId?: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  authorId: string;
  body: string;
  createdAt: string;
  /** Epoch ms — used for unsend window in Firestore rules */
  createdAtMs?: number;
  attachments?: ImageAttachment[];
};

/** Per-user read cursors for all conversations */
export type ChatMemberState = {
  userId: string;
  readByConversation: Record<string, string>;
  updatedAt: string;
};

export type PersonPresence = {
  userId: string;
  online: boolean;
  lastSeenAt: string;
  /** Effective IANA timezone (synced from client while online). */
  timezone?: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  /** Hex accent for task grouping and chips */
  color: string;
  /** When set, partners in these departments can see this project and all of its tasks. */
  departmentIds?: string[];
  completed: boolean;
  createdAt: string;
  completedAt?: string;
};

export type AppointmentStatus = "scheduled" | "canceled";

export type AppointmentRecurrenceKind = "daily" | "weekly" | "monthly" | "monthly_day";

export type AppointmentRecurrenceRule = {
  kind: AppointmentRecurrenceKind;
  interval: number;
  dayOfMonth?: number;
};

export type Appointment = {
  id: string;
  title: string;
  description?: string;
  /** ISO datetime — used for calendar placement */
  startsAt: string;
  /** Optional ISO datetime */
  endsAt?: string;
  location: string;
  meetingLink?: string;
  /** People attending (may or may not include the creator) */
  participantIds: string[];
  /** Whole departments invited — any member is a participant */
  participantDepartmentIds: string[];
  createdById: string;
  status: AppointmentStatus;
  createdAt: string;
  canceledAt?: string;
  attachments?: ImageAttachment[];
  /** Optional link to an open task @deprecated prefer tasks with appointmentId */
  taskId?: string;
  /** Checklist — what to review / have ready before the meeting */
  reviewItems?: string[];
  /** Explicitly linked open tasks (source of truth for meeting ↔ task links) */
  linkedTaskIds?: string[];
  /** Shared id for materialized recurring instances */
  recurrenceSeriesId?: string;
  /** 0-based index within the series */
  recurrenceIndex?: number;
  /** Recurrence pattern (stored on each instance in the series) */
  recurrenceRule?: AppointmentRecurrenceRule;
  /** Total meetings in the series when created */
  recurrenceCount?: number;
};

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type CommentReactions = {
  likes: string[];
  dislikes: string[];
};

/** Media file stored in Firebase Storage; URL + path saved in Firestore. */
export type ImageAttachment = {
  url: string;
  storagePath: string;
  name?: string;
  kind?: InlineMediaKind;
  /** Client fingerprint (name + size + lastModified) — used to block duplicate picks. */
  fingerprint?: string;
};

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export type InlineMediaKind = "image" | "video" | "audio" | "file";

export type TaskComment = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  reactions?: CommentReactions;
  attachments?: ImageAttachment[];
};

/** One deliverable progress note on a task (replaces monolithic `updates` string). */
export type TaskUpdateEntry = {
  id: string;
  authorId: string;
  /** Short plain-text label shown in the update header */
  title?: string;
  /** Rich HTML — same rules as legacy `updates` */
  body: string;
  createdAt: string;
};

/** Firestore sync for comment like/dislike notifications. */
export type CommentReactionNotifyChange =
  | { kind: "added"; vote: "like" | "dislike" }
  | { kind: "cleared" };

export type TaskFeedbackResponse = {
  personId: string;
  body: string;
  createdAt: string;
  attachments?: ImageAttachment[];
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
  | "mention_update"
  | "task_feedback"
  | "task_feedback_reply"
  | "task_finished"
  | "task_postponed"
  | "task_created"
  | "task_marked_complete"
  | "task_reopened"
  | "comment_reaction"
  | "reminder_shared"
  | "reminder_due"
  | "member_joined"
  | "chat_message";

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
  /** Chat notification — conversation to open */
  conversationId?: string;
  read: boolean;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  /** Shared progress notes — simple HTML (bold, underline, highlight) @deprecated use updateEntries */
  updates: string;
  /** @deprecated Legacy — all workers share `updates`; cleared on save */
  updatesByUser: Record<string, string>;
  /** Deliverable-style progress updates (new source of truth) */
  updateEntries: TaskUpdateEntry[];
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
  /** Optional — at most one project per task */
  projectId?: string;
  /** Set when the task was created for a specific appointment */
  appointmentId?: string;
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
  attachments?: ImageAttachment[];
};

/** Per-person reminder — may link to a contact, open task, and/or appointment. */
export type PersonalReminder = {
  id: string;
  ownerId: string;
  title: string;
  dueAt: string;
  notes: string;
  done: boolean;
  createdAt: string;
  attachments?: ImageAttachment[];
  contactId?: string;
  taskId?: string;
  appointmentId?: string;
  /** Other people who should see this reminder */
  participantIds: string[];
  /** Whole departments invited — any member is a participant */
  participantDepartmentIds: string[];
  /** Auto due-alert slots already sent: 1d, 6h, 2h, 30m */
  dueNotifyFired?: string[];
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
