export type Person = {
  id: string;
  name: string;
  role: string;
  email: string;
  department: string;
  /** Set when this row is linked to Firebase Auth (bootstrap / profile sync) */
  authUid?: string;
};

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
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

export type Task = {
  id: string;
  title: string;
  description: string;
  /** People responsible for the work — ids from org `people` in Firestore */
  assigneeIds: string[];
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
};

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

export type TabId = "tasks" | "contacts" | "calendar";

export type TaskListScope = "my" | "everyone";
