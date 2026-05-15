import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Clock, ClockAlert } from "lucide-react";
import type { Person, Task, TaskListScope, TaskPriority, TaskSector } from "../types";
import { TASK_SECTOR_CHIP_CLASS, TASK_SECTOR_LABELS, TASK_SECTORS } from "../types";

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

const PRIORITY_SHORT_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Shown on hover (native tooltip) for priority and segmented control. */
const PRIORITY_TOOLTIPS: Record<TaskPriority, string> = {
  urgent: "Critical — treat as top priority; do before other work when possible.",
  high: "High — should be done ASAP; ahead of the normal queue.",
  medium: "Medium — normal priority; schedule with everyday work.",
  low: "Low — no rush; pick up when there is spare capacity.",
};

const PRIORITY_BADGE: Record<TaskPriority, { pill: string; iconColor: string }> = {
  urgent: {
    pill: "bg-rose-100",
    iconColor: "text-rose-700",
  },
  high: {
    pill: "bg-orange-100",
    iconColor: "text-orange-800",
  },
  medium: {
    pill: "bg-indigo-50",
    iconColor: "text-indigo-700",
  },
  low: {
    pill: "bg-emerald-100",
    iconColor: "text-emerald-800",
  },
};

/** Lucide paths use stroke="currentColor" — `text-*` sets `color` (keep mid tones so strokes read as hue, not black). */
function PriorityUrgencyIcon({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const Icon = priority === "urgent" || priority === "high" ? ClockAlert : Clock;
  const { iconColor } = PRIORITY_BADGE[priority];
  return (
    <Icon
      className={`shrink-0 ${iconColor} ${className ?? ""}`}
      strokeWidth={2}
      aria-hidden
    />
  );
}

function PrioritySegmented({
  value,
  onChange,
  size = "md",
}: {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void;
  size?: "sm" | "md";
}) {
  const btn =
    size === "sm"
      ? "h-7 min-w-[2rem] px-1 py-0.5 sm:h-8 sm:min-w-[2.25rem]"
      : "h-8 min-w-[2.25rem] px-1 py-0.5 sm:h-9 sm:min-w-[2.5rem]";
  const icon = size === "sm" ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4 w-4 sm:h-[18px] sm:w-[18px]";
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Priority">
      {PRIORITY_ORDER.map((p) => {
        const selected = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            title={PRIORITY_TOOLTIPS[p]}
            aria-label={PRIORITY_SHORT_LABEL[p]}
            aria-pressed={selected}
            className={`inline-flex ${btn} shrink-0 items-center justify-center rounded-md border transition ${PRIORITY_BADGE[p].pill} ${
              selected
                ? "border-accent ring-2 ring-accent/45 ring-offset-1 ring-offset-white"
                : "border-slate-300/50 hover:border-slate-400/60"
            }`}
          >
            <PriorityUrgencyIcon priority={p} className={icon} />
          </button>
        );
      })}
    </div>
  );
}

function formatDue(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function addDaysToDateOnly(isoDate: string, days: number): string {
  if (!isoDate || isoDate.length < 10) return isoDate;
  const d = new Date(isoDate.slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function taskInvolvesPerson(task: Task, personId: string): boolean {
  return task.assigneeIds.includes(personId) || task.assignedById === personId;
}

/** Empty filterIds = show all. If exclusive, task must involve every selected person (AND); else any (OR). */
function taskMatchesInvolvedFilter(task: Task, filterPersonIds: string[], exclusive: boolean): boolean {
  if (filterPersonIds.length === 0) return true;
  if (exclusive) {
    return filterPersonIds.every((pid) => taskInvolvesPerson(task, pid));
  }
  return filterPersonIds.some((pid) => taskInvolvesPerson(task, pid));
}

function personMatchesSearch(p: Person, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${p.name} ${p.email} ${p.role} ${p.department}`.toLowerCase().includes(s);
}

/** Footer “For” line: comma-separated names with current user highlighted (no YOU badge). */
function AssigneeNamesForFooter({
  assigneeIds,
  people,
  currentUserId,
}: {
  assigneeIds: string[];
  people: Person[];
  currentUserId: string;
}) {
  if (assigneeIds.length === 0) {
    return <span className="font-medium text-slate-500">Open</span>;
  }
  return (
    <>
      {assigneeIds.map((id, i) => {
        const name = people.find((p) => p.id === id)?.name ?? id;
        const isMe = id === currentUserId;
        return (
          <span key={id}>
            {i > 0 ? <span className="text-slate-400">, </span> : null}
            {isMe ? (
              <span className="font-semibold text-indigo-700 underline decoration-indigo-400 underline-offset-2">
                {name}
              </span>
            ) : (
              <span className="font-medium text-slate-800">{name}</span>
            )}
          </span>
        );
      })}
    </>
  );
}

/** Same compact control as the Everyone “Involved” filter: one row trigger + popover checkboxes. */
function CompactPeopleMultiSelect({
  people,
  value,
  onChange,
  summaryPrefix,
  ariaLabel,
  allowClear = true,
  minSelected,
  emptySummary,
  clearButtonLabel = "Clear",
}: {
  people: Person[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Optional muted label before summary (e.g. “Involved”). Omit for names only. */
  summaryPrefix?: string;
  ariaLabel: string;
  allowClear?: boolean;
  minSelected?: number;
  /** When selection is empty, summary text (default: “All” if allowClear, else “Choose…”). */
  emptySummary?: string;
  /** Label for the clear button in the popover (default: “Clear”). */
  clearButtonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const filtered = useMemo(() => people.filter((p) => personMatchesSearch(p, search)), [people, search]);

  function toggle(pid: string) {
    if (value.includes(pid)) {
      if (minSelected != null && value.length <= minSelected) return;
      onChange(value.filter((x) => x !== pid));
    } else onChange([...value, pid]);
  }

  const summary =
    value.length === 0
      ? emptySummary !== undefined
        ? emptySummary
        : allowClear
          ? "All"
          : "Choose…"
      : value.length === 1
        ? people.find((p) => p.id === value[0])?.name ?? "1"
        : `${value.length}`;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-base flex h-[34px] w-fit min-w-[9rem] max-w-[12rem] items-center justify-between gap-1.5 rounded-lg py-0 pl-2 pr-1.5 text-left text-xs sm:h-9 sm:text-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate">
          {summaryPrefix && summaryPrefix.trim() !== "" ? (
            <>
              <span className="text-slate-400">{summaryPrefix} </span>
              <span className="font-medium text-slate-800">{summary}</span>
            </>
          ) : (
            <span className="font-medium text-slate-800">{summary}</span>
          )}
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black/5"
          role="listbox"
          aria-label={ariaLabel}
        >
          <input
            type="search"
            placeholder="Search people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base mb-1.5 w-full py-1.5 text-xs"
          />
          <div className="max-h-36 overflow-y-auto text-xs">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-center text-slate-500">No matches.</p>
            ) : (
              <>
                {filtered.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={value.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.name}</span>
                  </label>
                ))}
              </>
            )}
          </div>
          {allowClear && value.length > 0 && (
            <button
              type="button"
              className="mt-1.5 w-full rounded-md border border-slate-200 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => onChange([])}
            >
              {clearButtonLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TasksTab({
  people,
  tasks,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  currentUserId,
}: {
  people: Person[];
  tasks: Task[];
  onAddTask: (t: Omit<Task, "id" | "createdAt">) => Promise<void>;
  onUpdateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  onRemoveTask: (id: string) => Promise<void>;
  currentUserId: string;
}) {
  const [scope, setScope] = useState<TaskListScope>("my");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [everyoneInvolvedFilter, setEveryoneInvolvedFilter] = useState<string[]>([]);
  const [everyoneFilterExclusive, setEveryoneFilterExclusive] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (scope === "my") {
        if (!t.assigneeIds.includes(currentUserId)) return false;
      } else if (!taskMatchesInvolvedFilter(t, everyoneInvolvedFilter, everyoneFilterExclusive)) {
        return false;
      }
      if (!q) return true;
      const blob =
        `${t.title} ${t.description} ${TASK_SECTOR_LABELS[t.sector]} ${PRIORITY_SHORT_LABEL[t.priority]}`.toLowerCase();
      return blob.includes(q);
    });
  }, [tasks, scope, currentUserId, query, everyoneInvolvedFilter, everyoneFilterExclusive]);

  const sorted = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const prioRank = (p: TaskPriority) => PRIORITY_ORDER.indexOf(p);
    return [...filtered].sort((a, b) => {
      if (a.status === "done" !== (b.status === "done")) return a.status === "done" ? 1 : -1;
      if (a.needsFeedback !== b.needsFeedback) return a.needsFeedback ? -1 : 1;
      const aOver = a.status !== "done" && a.dueDate < today;
      const bOver = b.status !== "done" && b.dueDate < today;
      if (aOver !== bOver) return aOver ? -1 : 1;
      const dd = a.dueDate.localeCompare(b.dueDate);
      if (dd !== 0) return dd;
      return prioRank(a.priority) - prioRank(b.priority);
    });
  }, [filtered]);

  async function addTask(payload: Omit<Task, "id" | "createdAt">) {
    await onAddTask(payload);
    setShowForm(false);
  }

  function updateTask(id: string, patch: Partial<Task>) {
    void onUpdateTask(id, patch).catch(console.error);
  }

  function removeTask(id: string) {
    void onRemoveTask(id).catch(console.error);
  }

  return (
    <div className="space-y-6">
      {showForm ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back
            </button>
          </div>
          <NewTaskForm people={people} currentUserId={currentUserId} onSubmit={(p) => void addTask(p)} />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-inner">
                <button
                  type="button"
                  onClick={() => setScope("my")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    scope === "my" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
                  }`}
                >
                  My tasks
                </button>
                <button
                  type="button"
                  onClick={() => setScope("everyone")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    scope === "everyone"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600"
                  }`}
                >
                  Everyone
                </button>
              </span>
              {scope === "everyone" && (
                <>
                  <CompactPeopleMultiSelect
                    people={people}
                    value={everyoneInvolvedFilter}
                    onChange={setEveryoneInvolvedFilter}
                    summaryPrefix="Involved"
                    ariaLabel="Filter by involved people"
                  />
                  <label
                    className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-slate-500 sm:text-[11px]"
                    title="Checked: task must involve every selected person. Unchecked: task involves any one of them."
                  >
                    <input
                      type="checkbox"
                      checked={everyoneFilterExclusive}
                      onChange={(e) => setEveryoneFilterExclusive(e.target.checked)}
                      className="h-3 w-3 shrink-0 rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span className="whitespace-nowrap">Exclusive</span>
                  </label>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-dim"
            >
              New task
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="input-base max-w-md py-2 text-sm"
            />
          </div>

          <ul className="space-y-3 overflow-visible">
            {sorted.map((task) => (
              <li key={task.id} className="overflow-visible">
                <TaskCard
                  task={task}
                  people={people}
                  currentUserId={currentUserId}
                  onChange={(patch) => updateTask(task.id, patch)}
                  onCancelTask={() => removeTask(task.id)}
                />
              </li>
            ))}
          </ul>

          {sorted.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
              No tasks here. Switch to Everyone or add a task for someone (including yourself).
            </p>
          )}
        </>
      )}
    </div>
  );
}

function NewTaskForm({
  people,
  currentUserId,
  onSubmit,
}: {
  people: Person[];
  currentUserId: string;
  onSubmit: (t: Omit<Task, "id" | "createdAt">) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [sector, setSector] = useState<TaskSector>("general");

  useEffect(() => {
    setAssigneeIds((prev) => prev.filter((id) => people.some((p) => p.id === id)));
  }, [people]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      assigneeIds: [...new Set(assigneeIds)],
      assignedById: currentUserId,
      status: "todo",
      priority,
      sector,
      dueDate,
      originalDueDate: dueDate,
      postponeCount: 0,
      needsFeedback: false,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <p className="text-sm font-semibold text-slate-900">New task</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Assign to nobody (Open) or pick people. You are recorded as who created the task.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Title">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-base py-2"
            placeholder="What needs to happen"
          />
        </Field>
        <Field label="Due">
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="input-base py-2"
          />
        </Field>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 block text-xs font-medium text-slate-600">Assign to</span>
          <CompactPeopleMultiSelect
            people={people}
            value={assigneeIds}
            onChange={setAssigneeIds}
            ariaLabel="Choose assignees"
            allowClear
            emptySummary="Open"
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 block text-xs font-medium text-slate-600">Priority</span>
          <PrioritySegmented value={priority} onChange={setPriority} />
        </div>
        <Field label="Sector">
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value as TaskSector)}
            className="input-base py-2"
          >
            {TASK_SECTORS.map((s) => (
              <option key={s} value={s}>
                {TASK_SECTOR_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="hidden sm:block" aria-hidden />
        <div className="sm:col-span-3">
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-base min-h-[80px] resize-y py-2"
              placeholder="Deadline context, links, what “done” means…"
            />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
        >
          Create
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function TaskCard({
  task,
  people,
  currentUserId,
  onChange,
  onCancelTask,
}: {
  task: Task;
  people: Person[];
  currentUserId: string;
  onChange: (patch: Partial<Task>) => void;
  onCancelTask: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.status !== "done" && task.dueDate < today;
  const postponed = task.postponeCount > 0;
  const [descOpen, setDescOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const isAssignee = task.assigneeIds.includes(currentUserId);
  const isAssigner = task.assignedById === currentUserId;
  const descPreview =
    task.description.length > 160 && !descOpen
      ? task.description.slice(0, 160).trimEnd() + "…"
      : task.description;

  return (
    <article className="relative overflow-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <span
        className={`pointer-events-auto absolute right-0 top-0 z-10 flex translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 p-1 shadow-sm ring-1 ring-white/80 ${PRIORITY_BADGE[task.priority].pill}`}
        title={PRIORITY_TOOLTIPS[task.priority]}
        role="img"
        aria-label={`Priority: ${PRIORITY_SHORT_LABEL[task.priority]}`}
      >
        <PriorityUrgencyIcon priority={task.priority} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </span>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-7 sm:pr-8">
          <div className="flex flex-wrap items-start gap-2">
            <input
              value={task.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </div>
          <p className="mt-1 text-xs leading-snug text-slate-500">
            <span
              className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-tight sm:text-[11px] ${TASK_SECTOR_CHIP_CLASS[task.sector]}`}
            >
              {TASK_SECTOR_LABELS[task.sector]}
            </span>
            <span className="text-slate-300"> · </span>
            <span className="font-medium text-slate-700">Due {formatDue(task.dueDate)}</span>
            {overdue && <span className="text-rose-700"> · Overdue</span>}
            {postponed && (
              <span className="text-amber-800">
                {" · "}
                <span className="whitespace-nowrap">
                  Postponed
                  <sup className="ml-0.5 text-[0.7em] font-semibold leading-none tracking-tight">
                    {task.postponeCount}
                  </sup>
                </span>
                <span> (was {formatDue(task.originalDueDate)})</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {task.status !== "done" ? (
            <>
              {isAssigner && (
                <button
                  type="button"
                  onClick={() => onChange({ status: "done" })}
                  className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 px-2.5 py-1 text-xs font-semibold text-emerald-950 ring-1 ring-emerald-800/35 hover:bg-emerald-900/30"
                >
                  Mark complete
                </button>
              )}
              {isAssignee && (
                <>
                  <button
                    type="button"
                    onClick={() => onChange({ status: "done" })}
                    className="rounded-lg border border-emerald-400/70 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-950 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
                  >
                    I finished
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ needsFeedback: !task.needsFeedback })}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                      task.needsFeedback
                        ? "border-orange-400 bg-orange-100 text-orange-950 ring-orange-300/90"
                        : "border-orange-200/90 bg-orange-50 text-orange-900 ring-orange-200/80 hover:bg-orange-100"
                    }`}
                  >
                    I need feedback
                  </button>
                </>
              )}
              {task.needsFeedback && (
                <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-900 ring-1 ring-orange-200/90">
                  Needs feedback
                </span>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => onChange({ status: "todo" })}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      {task.description && (
        <div className="mt-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{descPreview}</p>
          {task.description.length > 160 && (
            <button
              type="button"
              onClick={() => setDescOpen((o) => !o)}
              className="mt-1 text-xs font-medium text-accent hover:underline"
            >
              {descOpen ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-slate-600">Details</summary>
        <div className="mt-3 space-y-3 text-slate-700">
          <div>
            <span className="block text-[11px] font-medium text-slate-500">Description</span>
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200/80 bg-white px-2 py-1.5 text-xs leading-relaxed text-slate-800">
              {task.description.trim() ? task.description : <span className="text-slate-400">No description.</span>}
            </p>
          </div>
          <div>
            <span className="block text-[11px] font-medium text-slate-500">Assigned by</span>
            <p className="mt-1 text-xs font-medium text-slate-800">
              {people.find((p) => p.id === task.assignedById)?.name ?? "—"}
            </p>
          </div>
        </div>
      </details>

      <div className="mt-3 border-t border-slate-100 pt-3">
        {!cancelOpen ? (
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-tight text-slate-600">
              <span className="min-w-0">
                <span className="text-slate-400">For </span>
                <AssigneeNamesForFooter
                  assigneeIds={task.assigneeIds}
                  people={people}
                  currentUserId={currentUserId}
                />
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {task.status !== "done" && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      dueDate: addDaysToDateOnly(task.dueDate, 7),
                      postponeCount: task.postponeCount + 1,
                    })
                  }
                  className="rounded-md border border-violet-300/70 bg-violet-500/12 px-2 py-0.5 text-xs font-semibold text-violet-900 hover:bg-violet-500/22"
                  title="Push due date by one week. Counts each click; original due date is unchanged."
                >
                  Postpone
                </button>
              )}
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="rounded-md px-2 py-0.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-left shadow-sm">
            <p className="text-xs leading-relaxed text-amber-950">
              Cancelling removes it for <span className="font-medium">everyone</span>. It disappears from this board
              when work was abandoned, duplicated, or created by mistake — not when the work is actually done (use{" "}
              <span className="font-medium">Mark complete</span>
              {isAssignee ? (
                <>
                  {" "}
                  or <span className="font-medium">I finished</span>
                </>
              ) : null}
              ).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onCancelTask();
                  setCancelOpen(false);
                }}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Yes, cancel
              </button>
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Keep
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
