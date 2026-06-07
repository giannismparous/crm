import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { TaskComment } from "../types";
import { Clock, ClockAlert } from "lucide-react";
import type {
  Person,
  Project,
  Task,
  TaskFeedbackRequest,
  TaskListScope,
  TaskListTab,
  TaskPriority,
  CommentReactionNotifyChange,
} from "../types";
import { isTaskCanceled, isTaskCompleted, isTaskOpen } from "../utils/personTaskStats";
import type { TaskUpdateIntent } from "../utils/personTaskStats";
import { canSeeAllOrgData, type OrgRole } from "../auth/roles";
import { TEAM_DEPARTMENTS, departmentChipClass } from "../types";
import { PERSON_AVATAR_INLINE_SIZE, PersonAvatarStack, PersonNameInline } from "./PersonAvatar";
import { TaskCommentsSection } from "./TaskCommentsSection";
import { TaskUpdatesSection } from "./TaskUpdatesSection";
import {
  assigneeAvatarPeople,
  isSelfAssignedSingleWorkerTask,
  isTaskWorker,
  reopenTaskPatch,
  taskInvolvesPerson,
} from "../utils/taskAssignees";
import { taskHasFeedbackHistory, taskHasOpenFeedback } from "../utils/taskFeedback";
import { addDaysToOrgDateKey, datetimeLocalToIso, formatInOrgTime, orgTodayDateKey } from "../utils/orgTimezone";
import {
  ConfirmPanel,
  TaskWorkerActionButtons,
  TaskWorkerFlowPanel,
  type WorkerFlow,
} from "./TaskWorkerActions";
import type { NotificationKind } from "../types";
import { taskCommentsPlainText } from "../utils/taskComments";
import { mergedTaskUpdatesPlainText, taskUpdatesHasContent } from "../utils/taskUpdates";
import {
  UNASSIGNED_PROJECT_COLOR,
  UNASSIGNED_PROJECT_ID,
} from "../utils/projectColors";

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

type TaskListSortMode = "urgency" | "project";

type TaskProjectGroup = {
  id: string;
  label: string;
  color: string;
  completed: boolean;
  tasks: Task[];
};

function compareTasksByUrgency(a: Task, b: Task, listTab: TaskListTab): number {
  const today = orgTodayDateKey();
  const prioRank = (p: TaskPriority) => PRIORITY_ORDER.indexOf(p);
  if (listTab === "completed") {
    const ca = a.completedAt ?? a.createdAt;
    const cb = b.completedAt ?? b.createdAt;
    return cb.localeCompare(ca);
  }
  if (listTab === "canceled") {
    const ca = a.canceledAt ?? a.createdAt;
    const cb = b.canceledAt ?? b.createdAt;
    return cb.localeCompare(ca);
  }
  const created = b.createdAt.localeCompare(a.createdAt);
  if (created !== 0) return created;
  if (taskHasOpenFeedback(a) !== taskHasOpenFeedback(b)) return taskHasOpenFeedback(a) ? -1 : 1;
  const aOver = isTaskOpen(a) && a.dueDate < today;
  const bOver = isTaskOpen(b) && b.dueDate < today;
  if (aOver !== bOver) return aOver ? -1 : 1;
  const dd = a.dueDate.localeCompare(b.dueDate);
  if (dd !== 0) return dd;
  return prioRank(a.priority) - prioRank(b.priority);
}

function buildProjectTaskGroups(tasks: Task[], projects: Project[]): TaskProjectGroup[] {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const buckets = new Map<string, Task[]>();

  for (const task of tasks) {
    const key =
      task.projectId && projectById.has(task.projectId)
        ? task.projectId
        : UNASSIGNED_PROJECT_ID;
    const list = buckets.get(key) ?? [];
    list.push(task);
    buckets.set(key, list);
  }

  const groups: TaskProjectGroup[] = [];
  const projectIds = [...buckets.keys()].filter((id) => id !== UNASSIGNED_PROJECT_ID);

  const openIds = projectIds.filter((id) => !projectById.get(id)?.completed);
  const completeIds = projectIds.filter((id) => projectById.get(id)?.completed);
  openIds.sort((a, b) => (projectById.get(a)?.name ?? "").localeCompare(projectById.get(b)?.name ?? ""));
  completeIds.sort((a, b) => (projectById.get(a)?.name ?? "").localeCompare(projectById.get(b)?.name ?? ""));

  for (const id of [...openIds, ...completeIds]) {
    const project = projectById.get(id)!;
    groups.push({
      id,
      label: project.name,
      color: project.color,
      completed: project.completed,
      tasks: buckets.get(id) ?? [],
    });
  }

  const unassigned = buckets.get(UNASSIGNED_PROJECT_ID);
  if (unassigned && unassigned.length > 0) {
    groups.push({
      id: UNASSIGNED_PROJECT_ID,
      label: "Unassigned",
      color: UNASSIGNED_PROJECT_COLOR,
      completed: false,
      tasks: unassigned,
    });
  }

  return groups;
}

function ProjectGroupHeader({
  label,
  color,
  count,
  isFirst,
}: {
  label: string;
  color: string;
  count: number;
  isFirst?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 border-b-4 pb-2 ${isFirst ? "pt-0" : "pt-4"}`}
      style={{ borderColor: color }}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <h3 className="text-sm font-semibold" style={{ color }}>
        {label}
      </h3>
      <span className="text-xs tabular-nums text-slate-500">
        {count} {count === 1 ? "task" : "tasks"}
      </span>
    </div>
  );
}

export const PRIORITY_SHORT_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Shown on hover (native tooltip) for priority and segmented control. */
export const PRIORITY_TOOLTIPS: Record<TaskPriority, string> = {
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

/** Calendar / list chip colors keyed by task priority. */
export const TASK_PRIORITY_CALENDAR_CHIP: Record<
  TaskPriority,
  { stripe: string; bg: string; hover: string; label: string; text: string; ring: string; border: string }
> = {
  urgent: {
    stripe: "border-rose-600",
    bg: "bg-rose-50",
    hover: "hover:bg-rose-100/80",
    label: "text-rose-800",
    text: "text-rose-950",
    ring: "ring-rose-100",
    border: "border-rose-100",
  },
  high: {
    stripe: "border-orange-600",
    bg: "bg-orange-50",
    hover: "hover:bg-orange-100/80",
    label: "text-orange-800",
    text: "text-orange-950",
    ring: "ring-orange-100",
    border: "border-orange-100",
  },
  medium: {
    stripe: "border-indigo-600",
    bg: "bg-indigo-50",
    hover: "hover:bg-indigo-100/80",
    label: "text-indigo-800",
    text: "text-indigo-950",
    ring: "ring-indigo-100",
    border: "border-indigo-100",
  },
  low: {
    stripe: "border-emerald-600",
    bg: "bg-emerald-50",
    hover: "hover:bg-emerald-100/80",
    label: "text-emerald-800",
    text: "text-emerald-950",
    ring: "ring-emerald-100",
    border: "border-emerald-100",
  },
};

/** Lucide paths use stroke="currentColor" — `text-*` sets `color` (keep mid tones so strokes read as hue, not black). */
export function PriorityUrgencyIcon({
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

/** Multi-select urgency filter; empty selection = all priorities. */
export function PriorityFilter({
  value,
  onChange,
}: {
  value: TaskPriority[];
  onChange: (priorities: TaskPriority[]) => void;
}) {
  function toggle(p: TaskPriority) {
    if (value.includes(p)) onChange(value.filter((x) => x !== p));
    else onChange([...value, p]);
  }

  return (
    <div className="segment-track shrink-0" role="group" aria-label="Filter by urgency">
      {PRIORITY_ORDER.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            title={`${on ? "Hide" : "Show"} ${PRIORITY_SHORT_LABEL[p]} — ${PRIORITY_TOOLTIPS[p]}`}
            aria-label={`${PRIORITY_SHORT_LABEL[p]} urgency`}
            aria-pressed={on}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition sm:h-8 sm:w-8 ${
              on ? `${PRIORITY_BADGE[p].pill} priority-filter-on` : "priority-filter-off"
            }`}
          >
            <PriorityUrgencyIcon priority={p} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        );
      })}
    </div>
  );
}

export function PrioritySegmented({
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
              selected ? "priority-filter-on" : "priority-filter-off"
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
  return formatInOrgTime(datetimeLocalToIso(`${iso.slice(0, 10)}T12:00`), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function addDaysToDateOnly(isoDate: string, days: number): string {
  return addDaysToOrgDateKey(isoDate, days);
}

/** Empty filters = show all. People + departments combine with OR (default) or AND (exclusive). */
function taskMatchesEveryoneFilter(
  task: Task,
  filterPersonIds: string[],
  filterDepartmentIds: string[],
  exclusive: boolean,
  people: Person[]
): boolean {
  const hasPeople = filterPersonIds.length > 0;
  const hasDepts = filterDepartmentIds.length > 0;
  if (!hasPeople && !hasDepts) return true;

  const personMatch = !hasPeople
    ? true
    : exclusive
      ? filterPersonIds.every((pid) => taskInvolvesPerson(task, pid, people))
      : filterPersonIds.some((pid) => taskInvolvesPerson(task, pid, people));

  const deptMatch =
    !hasDepts || filterDepartmentIds.some((d) => task.assigneeDepartmentIds.includes(d));

  if (hasPeople && hasDepts) {
    return exclusive ? personMatch && deptMatch : personMatch || deptMatch;
  }
  return personMatch && deptMatch;
}

function personMatchesSearch(p: Person, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${p.name} ${p.email} ${p.title} ${p.departments.join(" ")}`.toLowerCase().includes(s);
}

/** Footer “For” line: comma-separated names with current user highlighted (no YOU badge). */
function AssigneeNamesForFooter({
  assigneeIds,
  assigneeDepartmentIds,
  people,
  currentUserId,
}: {
  assigneeIds: string[];
  assigneeDepartmentIds: string[];
  people: Person[];
  currentUserId: string;
}) {
  if (assigneeIds.length === 0 && assigneeDepartmentIds.length === 0) {
    return <span className="font-medium text-slate-500">Open</span>;
  }
  let itemIndex = 0;
  const parts: ReactNode[] = [];

  function pushSeparator() {
    if (itemIndex > 0) {
      parts.push(
        <span key={`sep-${itemIndex}`} className="px-0.5 text-slate-500" aria-hidden>
          ,
        </span>
      );
    }
    itemIndex++;
  }

  assigneeIds.forEach((id) => {
    const name = people.find((p) => p.id === id)?.name ?? id;
    const isMe = id === currentUserId;
    pushSeparator();
    parts.push(
      isMe ? (
        <span
          key={`p-${id}`}
          className="font-semibold text-indigo-700 underline decoration-indigo-400 underline-offset-2"
        >
          {name}
        </span>
      ) : (
        <span key={`p-${id}`} className="font-medium text-slate-800">
          {name}
        </span>
      )
    );
  });
  assigneeDepartmentIds.forEach((dept) => {
    pushSeparator();
    parts.push(
      <span key={`d-${dept}`} className="inline-flex items-center">
        <span className="font-medium text-violet-900">{dept}</span>
        <span className="text-slate-500"> (dept)</span>
      </span>
    );
  });

  const avatarPeople = assigneeAvatarPeople(assigneeIds, assigneeDepartmentIds, people);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="inline-flex flex-wrap items-center gap-y-1">{parts}</span>
      <PersonAvatarStack people={avatarPeople} size={PERSON_AVATAR_INLINE_SIZE} />
    </span>
  );
}


/** Everyone tab: filter by involved people and/or assigned department. */
function InvolvedFilterMultiSelect({
  people,
  personIds,
  departmentIds,
  onChangePeople,
  onChangeDepartments,
}: {
  people: Person[];
  personIds: string[];
  departmentIds: string[];
  onChangePeople: (ids: string[]) => void;
  onChangeDepartments: (ids: string[]) => void;
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

  const filteredPeople = useMemo(
    () => people.filter((p) => personMatchesSearch(p, search)),
    [people, search]
  );
  const filteredDepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [...TEAM_DEPARTMENTS];
    return TEAM_DEPARTMENTS.filter((d) => d.toLowerCase().includes(q));
  }, [search]);

  function togglePerson(id: string) {
    onChangePeople(personIds.includes(id) ? personIds.filter((x) => x !== id) : [...personIds, id]);
  }

  function toggleDepartment(dept: string) {
    onChangeDepartments(
      departmentIds.includes(dept) ? departmentIds.filter((d) => d !== dept) : [...departmentIds, dept]
    );
  }

  const summary = useMemo(() => {
    if (personIds.length === 0 && departmentIds.length === 0) return "All";
    const bits: string[] = [];
    if (personIds.length === 1) {
      bits.push(people.find((p) => p.id === personIds[0])?.name ?? "1 person");
    } else if (personIds.length > 1) bits.push(`${personIds.length} people`);
    if (departmentIds.length === 1) bits.push(departmentIds[0]!);
    else if (departmentIds.length > 1) bits.push(`${departmentIds.length} depts`);
    return bits.join(", ");
  }, [personIds, departmentIds, people]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-base flex h-[34px] w-fit min-w-[9rem] max-w-[14rem] items-center justify-between gap-1.5 rounded-lg py-0 pl-2 pr-1.5 text-left text-xs sm:h-9 sm:text-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate">
          <span className="text-slate-400">Filter </span>
          <span className="font-medium text-slate-800">{summary}</span>
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black/5"
          role="listbox"
          aria-label="Filter by people and department"
        >
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base mb-1.5 w-full py-1.5 text-xs"
          />
          <div className="max-h-52 overflow-y-auto text-xs">
            {filteredPeople.length > 0 && (
              <>
                <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  People
                </p>
                {filteredPeople.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={personIds.includes(p.id)}
                      onChange={() => togglePerson(p.id)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.name}</span>
                  </label>
                ))}
              </>
            )}
            {filteredDepts.length > 0 && (
              <>
                <p className="mt-1 border-t border-slate-100 px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Departments
                </p>
                {filteredDepts.map((dept) => (
                  <label
                    key={dept}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={departmentIds.includes(dept)}
                      onChange={() => toggleDepartment(dept)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${departmentChipClass(dept)}`}
                    >
                      {dept}
                    </span>
                  </label>
                ))}
              </>
            )}
            {filteredPeople.length === 0 && filteredDepts.length === 0 && (
              <p className="px-1 py-2 text-center text-slate-500">No matches.</p>
            )}
          </div>
          {(personIds.length > 0 || departmentIds.length > 0) && (
            <button
              type="button"
              className="mt-1.5 w-full rounded-md border border-slate-200 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => {
                onChangePeople([]);
                onChangeDepartments([]);
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AssigneeMultiSelect({
  people,
  assigneeIds,
  assigneeDepartmentIds,
  onChange,
}: {
  people: Person[];
  assigneeIds: string[];
  assigneeDepartmentIds: string[];
  onChange: (assigneeIds: string[], assigneeDepartmentIds: string[]) => void;
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

  const filteredPeople = useMemo(
    () => people.filter((p) => personMatchesSearch(p, search)),
    [people, search]
  );
  const filteredDepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [...TEAM_DEPARTMENTS];
    return TEAM_DEPARTMENTS.filter((d) => d.toLowerCase().includes(q));
  }, [search]);

  function togglePerson(id: string) {
    if (assigneeIds.includes(id)) onChange(assigneeIds.filter((x) => x !== id), assigneeDepartmentIds);
    else onChange([...assigneeIds, id], assigneeDepartmentIds);
  }

  function toggleDept(dept: string) {
    if (assigneeDepartmentIds.includes(dept))
      onChange(assigneeIds, assigneeDepartmentIds.filter((d) => d !== dept));
    else onChange(assigneeIds, [...assigneeDepartmentIds, dept]);
  }

  const summary = useMemo(() => {
    if (assigneeIds.length === 0 && assigneeDepartmentIds.length === 0) return "Open";
    const bits: string[] = [];
    if (assigneeIds.length === 1) {
      bits.push(people.find((p) => p.id === assigneeIds[0])?.name ?? "1 person");
    } else if (assigneeIds.length > 1) bits.push(`${assigneeIds.length} people`);
    if (assigneeDepartmentIds.length === 1) bits.push(assigneeDepartmentIds[0]!);
    else if (assigneeDepartmentIds.length > 1) bits.push(`${assigneeDepartmentIds.length} depts`);
    return bits.join(", ");
  }, [assigneeIds, assigneeDepartmentIds, people]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-base flex h-[34px] w-fit min-w-[9rem] max-w-[14rem] items-center justify-between gap-1.5 rounded-lg py-0 pl-2 pr-1.5 text-left text-xs sm:h-9 sm:text-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{summary}</span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black/5"
          role="listbox"
          aria-label="Choose assignees"
        >
          <input
            type="search"
            placeholder="Search people or departments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base mb-1.5 w-full py-1.5 text-xs"
          />
          <div className="max-h-52 overflow-y-auto text-xs">
            {filteredPeople.length > 0 && (
              <>
                <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  People
                </p>
                {filteredPeople.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(p.id)}
                      onChange={() => togglePerson(p.id)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.name}</span>
                  </label>
                ))}
              </>
            )}
            {filteredDepts.length > 0 && (
              <>
                <p className="mt-1 border-t border-slate-100 px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Departments
                </p>
                {filteredDepts.map((d) => (
                  <label
                    key={d}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={assigneeDepartmentIds.includes(d)}
                      onChange={() => toggleDept(d)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${departmentChipClass(d)}`}
                    >
                      {d}
                    </span>
                  </label>
                ))}
              </>
            )}
            {filteredPeople.length === 0 && filteredDepts.length === 0 && (
              <p className="px-1 py-2 text-center text-slate-500">No matches.</p>
            )}
          </div>
          {(assigneeIds.length > 0 || assigneeDepartmentIds.length > 0) && (
            <button
              type="button"
              className="mt-1.5 w-full rounded-md border border-slate-200 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => onChange([], [])}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TasksTab({
  people,
  projects,
  tasks,
  onAddTask,
  onUpdateTask,
  onCancelTask,
  onCommentPosted,
  onCommentReaction,
  onTaskActionNotify,
  onFeedbackReply,
  currentUserId,
  currentUserOrgRole,
  onBroadcastTaskEvent,
  focusTaskId,
  onFocusTaskHandled,
}: {
  people: Person[];
  projects: Project[];
  tasks: Task[];
  onAddTask: (t: Omit<Task, "id" | "createdAt">) => Promise<void>;
  onUpdateTask: (
    id: string,
    patch: Partial<Task>,
    options?: { intent?: TaskUpdateIntent; actorId?: string }
  ) => Promise<void>;
  onCancelTask: (id: string) => Promise<void>;
  onCommentPosted?: (task: Task, comment: TaskComment) => void | Promise<void>;
  onCommentReaction?: (
    task: Task,
    comment: TaskComment,
    change: CommentReactionNotifyChange
  ) => void | Promise<void>;
  onTaskActionNotify?: (
    task: Task,
    recipientIds: string[],
    kind: NotificationKind,
    preview: string
  ) => void | Promise<void>;
  onFeedbackReply?: (task: Task, request: TaskFeedbackRequest, body: string) => void | Promise<void>;
  currentUserId: string;
  currentUserOrgRole: OrgRole;
  onBroadcastTaskEvent?: (
    task: Task,
    kind: NotificationKind,
    preview: string
  ) => void | Promise<void>;
  focusTaskId?: string | null;
  onFocusTaskHandled?: () => void;
}) {
  const [scope, setScope] = useState<TaskListScope>("my");
  const [listTab, setListTab] = useState<TaskListTab>("open");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [everyoneInvolvedFilter, setEveryoneInvolvedFilter] = useState<string[]>([]);
  const [everyoneDepartmentFilter, setEveryoneDepartmentFilter] = useState<string[]>([]);
  const [everyoneFilterExclusive, setEveryoneFilterExclusive] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>([]);
  const [taskSortMode, setTaskSortMode] = useState<TaskListSortMode>("urgency");
  const taskRefs = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (!focusTaskId) return;
    const target = tasks.find((t) => t.id === focusTaskId);
    if (target && !isTaskWorker(target, currentUserId, people) && canSeeAllOrgData(currentUserOrgRole)) {
      setScope("everyone");
    }
    const t = window.setTimeout(() => {
      const el = taskRefs.current[focusTaskId];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocusTaskHandled?.();
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusTaskId, tasks, currentUserId, people, onFocusTaskHandled]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (listTab === "open" && !isTaskOpen(t)) return false;
      if (listTab === "completed" && !isTaskCompleted(t)) return false;
      if (listTab === "canceled" && !isTaskCanceled(t)) return false;
      if (scope === "my" && canSeeAllOrgData(currentUserOrgRole)) {
        if (!isTaskWorker(t, currentUserId, people)) return false;
      } else if (
        scope === "everyone" &&
        canSeeAllOrgData(currentUserOrgRole) &&
        !taskMatchesEveryoneFilter(
          t,
          everyoneInvolvedFilter,
          everyoneDepartmentFilter,
          everyoneFilterExclusive,
          people
        )
      ) {
        return false;
      }
      if (priorityFilter.length > 0 && !priorityFilter.includes(t.priority)) return false;
      if (!q) return true;
      const projectName = projects.find((p) => p.id === t.projectId)?.name ?? "";
      const blob =
        `${t.title} ${t.description} ${projectName} ${t.assigneeDepartmentIds.join(" ")} ${mergedTaskUpdatesPlainText(t, people)} ${taskCommentsPlainText(t.comments)} ${PRIORITY_SHORT_LABEL[t.priority]}`.toLowerCase();
      return blob.includes(q);
    });
  }, [
    tasks,
    listTab,
    scope,
    currentUserOrgRole,
    currentUserId,
    people,
    query,
    everyoneInvolvedFilter,
    everyoneDepartmentFilter,
    everyoneFilterExclusive,
    priorityFilter,
    projects,
  ]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => compareTasksByUrgency(a, b, listTab));
  }, [filtered, listTab]);

  const projectGroups = useMemo(() => {
    if (taskSortMode !== "project") return [];
    return buildProjectTaskGroups(sorted, projects).map((g) => ({
      ...g,
      tasks: [...g.tasks].sort((a, b) => compareTasksByUrgency(a, b, listTab)),
    }));
  }, [sorted, projects, taskSortMode, listTab]);

  const taskStats = useMemo(() => {
    const today = orgTodayDateKey();
    const openTasks = tasks.filter((t) => isTaskOpen(t)).length;
    const overdue = tasks.filter((t) => isTaskOpen(t) && t.dueDate < today).length;
    const completed = tasks.filter((t) => isTaskCompleted(t)).length;
    const canceled = tasks.filter((t) => isTaskCanceled(t)).length;
    return { openTasks, overdue, completed, canceled };
  }, [tasks]);

  async function addTask(payload: Omit<Task, "id" | "createdAt">) {
    await onAddTask(payload);
    setShowForm(false);
  }

  function updateTask(id: string, patch: Partial<Task>, intent?: TaskUpdateIntent) {
    if (intent === "reopen") setListTab("open");
    return onUpdateTask(id, patch, { intent, actorId: currentUserId }).catch((e) => {
      console.error(e);
      throw e;
    });
  }

  function cancelTask(id: string) {
    setListTab("canceled");
    return onCancelTask(id).catch((e) => {
      console.error(e);
      throw e;
    });
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
          <NewTaskForm
            people={people}
            projects={projects}
            currentUserId={currentUserId}
            onSubmit={(p) => void addTask(p)}
          />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">Tasks</h2>
                <div
                  className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-tight text-slate-500 sm:gap-x-2 sm:text-xs"
                  aria-label="Tasks summary"
                >
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-indigo-700">{taskStats.openTasks}</span>
                    <span className="font-normal">Open</span>
                  </span>
                  <span className="px-0.5 text-slate-300" aria-hidden>
                    |
                  </span>
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-rose-700">{taskStats.overdue}</span>
                    <span className="font-normal">Overdue</span>
                  </span>
                  <span className="px-0.5 text-slate-300" aria-hidden>
                    |
                  </span>
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-emerald-700">{taskStats.completed}</span>
                    <span className="font-normal">Completed</span>
                  </span>
                  <span className="px-0.5 text-slate-300" aria-hidden>
                    |
                  </span>
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-slate-600">{taskStats.canceled}</span>
                    <span className="font-normal">Canceled</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="segment-track">
                  {(
                    [
                      ["open", "Open"],
                      ["completed", "Completed"],
                      ["canceled", "Canceled"],
                    ] as const
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setListTab(tab)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                        listTab === tab ? "segment-tab-active" : "segment-tab-inactive"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
              {canSeeAllOrgData(currentUserOrgRole) ? (
              <span className="segment-track">
                <button
                  type="button"
                  onClick={() => setScope("my")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    scope === "my" ? "segment-tab-active" : "segment-tab-inactive"
                  }`}
                >
                  My tasks
                </button>
                <button
                  type="button"
                  onClick={() => setScope("everyone")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    scope === "everyone" ? "segment-tab-active" : "segment-tab-inactive"
                  }`}
                >
                  Everyone
                </button>
              </span>
              ) : (
                <span className="text-xs font-semibold text-slate-600">Department tasks</span>
              )}
              {scope === "everyone" && canSeeAllOrgData(currentUserOrgRole) && (
                <>
                  <InvolvedFilterMultiSelect
                    people={people}
                    personIds={everyoneInvolvedFilter}
                    departmentIds={everyoneDepartmentFilter}
                    onChangePeople={setEveryoneInvolvedFilter}
                    onChangeDepartments={setEveryoneDepartmentFilter}
                  />
                  <label
                    className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-slate-500 sm:text-[11px]"
                    title="Unchecked: match any selected person or department. Checked: must match all selected."
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
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-dim"
            >
              New task
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="input-base min-w-0 w-full max-w-md py-2 text-sm"
            />
            <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
              <label className="inline-flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap text-xs font-medium text-slate-600 sm:text-sm">Sort by</span>
                <select
                  value={taskSortMode}
                  onChange={(e) => setTaskSortMode(e.target.value as TaskListSortMode)}
                  className="input-base w-auto min-w-[8.5rem] cursor-pointer py-2 pr-8 text-sm"
                  aria-label="Sort by"
                >
                  <option value="urgency">Urgency</option>
                  <option value="project">Project</option>
                </select>
              </label>
              <PriorityFilter value={priorityFilter} onChange={setPriorityFilter} />
            </div>
          </div>

          <ul className="space-y-3 overflow-visible">
            {taskSortMode === "urgency"
              ? sorted.map((task) => (
                  <li
                    key={task.id}
                    ref={(el) => {
                      taskRefs.current[task.id] = el;
                    }}
                    className="overflow-visible"
                  >
                    <TaskCard
                      task={task}
                      people={people}
                      projects={projects}
                      currentUserId={currentUserId}
                      currentUserOrgRole={currentUserOrgRole}
                      highlighted={task.id === focusTaskId}
                      onChange={(patch, intent) => updateTask(task.id, patch, intent)}
                      onCancelTask={() => cancelTask(task.id).catch(console.error)}
                      onCommentPosted={onCommentPosted}
                      onCommentReaction={onCommentReaction}
                      onTaskActionNotify={onTaskActionNotify}
                      onFeedbackReply={onFeedbackReply}
                      onBroadcastTaskEvent={onBroadcastTaskEvent}
                    />
                  </li>
                ))
              : projectGroups.map((group, groupIndex) => (
                  <li key={group.id} className="list-none space-y-3">
                    <ProjectGroupHeader
                      label={group.label}
                      color={group.color}
                      count={group.tasks.length}
                      isFirst={groupIndex === 0}
                    />
                    <ul className="space-y-3">
                      {group.tasks.map((task) => (
                        <li
                          key={task.id}
                          ref={(el) => {
                            taskRefs.current[task.id] = el;
                          }}
                          className="overflow-visible"
                        >
                          <TaskCard
                            task={task}
                            people={people}
                            projects={projects}
                            currentUserId={currentUserId}
                            currentUserOrgRole={currentUserOrgRole}
                            highlighted={task.id === focusTaskId}
                            showProjectChip={false}
                            onChange={(patch, intent) => updateTask(task.id, patch, intent)}
                            onCancelTask={() => cancelTask(task.id).catch(console.error)}
                            onCommentPosted={onCommentPosted}
                            onCommentReaction={onCommentReaction}
                            onTaskActionNotify={onTaskActionNotify}
                            onFeedbackReply={onFeedbackReply}
                            onBroadcastTaskEvent={onBroadcastTaskEvent}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
          </ul>

          {sorted.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
              {listTab === "open"
                ? "No open tasks. Switch tab, scope, or create a task."
                : listTab === "completed"
                  ? "No completed tasks yet."
                  : "No canceled tasks."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function NewTaskForm({
  people,
  projects,
  currentUserId,
  defaultProjectId = "",
  lockProject = false,
  onSubmit,
}: {
  people: Person[];
  projects: Project[];
  currentUserId: string;
  defaultProjectId?: string;
  lockProject?: boolean;
  onSubmit: (t: Omit<Task, "id" | "createdAt">) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeDepartmentIds, setAssigneeDepartmentIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(() => orgTodayDateKey());
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [projectId, setProjectId] = useState(defaultProjectId);

  useEffect(() => {
    setAssigneeIds((prev) => prev.filter((id) => people.some((p) => p.id === id)));
  }, [people]);

  useEffect(() => {
    if (lockProject) setProjectId(defaultProjectId);
  }, [defaultProjectId, lockProject]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const payload: Omit<Task, "id" | "createdAt"> = {
      title: title.trim(),
      description: description.trim(),
      assigneeIds: [...new Set(assigneeIds)],
      assigneeDepartmentIds: [...new Set(assigneeDepartmentIds)],
      finishedByIds: [],
      feedbackByIds: [],
      feedbackRequests: [],
      assignedById: currentUserId,
      status: "todo",
      priority,
      dueDate,
      originalDueDate: dueDate,
      postponeCount: 0,
      needsFeedback: false,
      updates: "",
      updatesByUser: {},
      comments: [],
    };
    const pid = (lockProject ? defaultProjectId : projectId).trim();
    if (pid) payload.projectId = pid;
    await onSubmit(payload);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <p className="text-sm font-semibold text-slate-900">New task</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Title">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-base py-2"
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
          <AssigneeMultiSelect
            people={people}
            assigneeIds={assigneeIds}
            assigneeDepartmentIds={assigneeDepartmentIds}
            onChange={(ids, deptIds) => {
              setAssigneeIds(ids);
              setAssigneeDepartmentIds(deptIds);
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 block text-xs font-medium text-slate-600">Priority</span>
          <PrioritySegmented value={priority} onChange={setPriority} />
        </div>
        {!lockProject && (
          <Field label="Project">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input-base py-2"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="sm:col-span-3">
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-base min-h-[80px] resize-y py-2"
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
  projects,
  currentUserId,
  currentUserOrgRole,
  highlighted,
  showProjectChip = true,
  onChange,
  onCancelTask,
  onCommentPosted,
  onCommentReaction,
  onTaskActionNotify,
  onFeedbackReply,
  onBroadcastTaskEvent,
}: {
  task: Task;
  people: Person[];
  projects: Project[];
  currentUserId: string;
  currentUserOrgRole: OrgRole;
  highlighted?: boolean;
  showProjectChip?: boolean;
  onChange: (patch: Partial<Task>, intent?: TaskUpdateIntent) => void | Promise<void>;
  onCancelTask: () => void | Promise<void>;
  onCommentPosted?: (task: Task, comment: TaskComment) => void | Promise<void>;
  onCommentReaction?: (
    task: Task,
    comment: TaskComment,
    change: CommentReactionNotifyChange
  ) => void | Promise<void>;
  onTaskActionNotify?: (
    task: Task,
    recipientIds: string[],
    kind: NotificationKind,
    preview: string
  ) => void | Promise<void>;
  onFeedbackReply?: (task: Task, request: TaskFeedbackRequest, body: string) => void | Promise<void>;
  onBroadcastTaskEvent?: (
    task: Task,
    kind: NotificationKind,
    preview: string
  ) => void | Promise<void>;
}) {
  const today = orgTodayDateKey();
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const canceled = isTaskCanceled(task);
  const completed = isTaskCompleted(task);
  const overdue = isTaskOpen(task) && task.dueDate < today;
  const postponed = task.postponeCount > 0;
  const [descOpen, setDescOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [workerFlow, setWorkerFlow] = useState<WorkerFlow>(null);
  const isWorker = isTaskWorker(task, currentUserId, people);
  const isAssigner = task.assignedById === currentUserId;
  const canCancelTask = isAssigner || isWorker;
  const canReopen = currentUserOrgRole === "founder" || isTaskWorker;
  const actorLabel = people.find((p) => p.id === currentUserId)?.name ?? "Someone";
  const hasOpenFeedback = taskHasOpenFeedback(task);
  const hasFeedbackHistory = taskHasFeedbackHistory(task);
  const descPreview =
    task.description.length > 160 && !descOpen
      ? task.description.slice(0, 160).trimEnd() + "…"
      : task.description;
  const selfAssigned = isSelfAssignedSingleWorkerTask(task, people);
  const assigner = task.assignedById ? people.find((p) => p.id === task.assignedById) : undefined;
  const assignerName =
    !selfAssigned && assigner?.name
      ? assigner.name
      : !selfAssigned && task.assignedById
        ? "—"
        : null;

  return (
    <article
      className={`relative overflow-visible rounded-xl border bg-white p-4 shadow-sm sm:p-5 ${
        highlighted ? "task-card-highlight" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 pr-1 sm:pr-2">
          <div className="flex flex-wrap items-start gap-2">
            <input
              value={task.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-900 outline-none"
            />
          </div>
          <p className="mt-1 text-xs leading-snug text-slate-500">
            {showProjectChip && project && (
              <>
                <span className="font-semibold" style={{ color: project.color }}>
                  {project.name}
                </span>
                <span className="text-slate-300"> · </span>
              </>
            )}
            <span className="font-medium text-slate-700">Due {formatDue(task.dueDate)}</span>
            {canceled && (
              <span className="text-slate-600">
                {" · Canceled"}
                {task.canceledAt && ` ${formatDue(task.canceledAt.slice(0, 10))}`}
              </span>
            )}
            {completed && !canceled && task.completedAt && (
              <span className="text-emerald-800"> · Completed {formatDue(task.completedAt.slice(0, 10))}</span>
            )}
            {overdue && !canceled && <span className="text-rose-700"> · Overdue</span>}
            {postponed && !canceled && (
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

        <div
          className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-2"
          aria-live="polite"
        >
          {!completed && !canceled ? (
            <>
              {isWorker && workerFlow === null && !task.finishedByIds.includes(currentUserId) && (
                <TaskWorkerActionButtons
                  task={task}
                  people={people}
                  currentUserId={currentUserId}
                  onFinish={() => setWorkerFlow("finish")}
                  onFeedback={() => setWorkerFlow("feedback")}
                />
              )}
              {hasFeedbackHistory && (
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-center text-[10px] font-semibold leading-tight shadow-sm sm:text-[11px] ${
                    hasOpenFeedback
                      ? "border-amber-400/90 bg-amber-50 text-amber-950 ring-1 ring-amber-300/65"
                      : "border-amber-300/80 bg-amber-50/90 text-amber-900 ring-1 ring-amber-200/70"
                  }`}
                  title={
                    hasOpenFeedback
                      ? "Waiting on feedback — see Comments"
                      : "Feedback was shared on this task — see Comments"
                  }
                >
                  Needs feedback
                </span>
              )}
              <span
                className={`inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200/70 p-1 shadow-sm priority-badge-ring ${PRIORITY_BADGE[task.priority].pill}`}
                title={PRIORITY_TOOLTIPS[task.priority]}
                role="img"
                aria-label={`Priority: ${PRIORITY_SHORT_LABEL[task.priority]}`}
              >
                <PriorityUrgencyIcon priority={task.priority} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
              {isAssigner && (
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      const title = task.title.trim() || "Task";
                      try {
                        await onChange({ status: "done" }, "mark_complete");
                        await onBroadcastTaskEvent?.(
                          task,
                          "task_marked_complete",
                          `${actorLabel} marked “${title}” complete.`
                        );
                      } catch (e) {
                        console.error(e);
                      }
                    })()
                  }
                  className="task-action-complete"
                >
                  Mark complete
                </button>
              )}
            </>
          ) : (
            <>
              {canReopen && completed && !reopenOpen && (
                <button
                  type="button"
                  onClick={() => setReopenOpen(true)}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Reopen
                </button>
              )}
              {completed && hasFeedbackHistory && (
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-center text-[10px] font-semibold leading-tight shadow-sm sm:text-[11px] ${
                    hasOpenFeedback
                      ? "border-amber-400/90 bg-amber-50 text-amber-950 ring-1 ring-amber-300/65"
                      : "border-amber-300/80 bg-amber-50/90 text-amber-900 ring-1 ring-amber-200/70"
                  }`}
                  title={
                    hasOpenFeedback
                      ? "Waiting on feedback — see Comments"
                      : "Feedback was shared on this task — see Comments"
                  }
                >
                  Needs feedback
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {reopenOpen && completed && (
        <div className="mt-3 w-full">
          <ConfirmPanel
            message="Reopen this task? It will move back to Open and clear finished status for everyone."
            yesLabel="Yes, reopen"
            noLabel="Keep completed"
            onYes={() =>
              void (async () => {
                const title = task.title.trim() || "Task";
                try {
                  await onChange(reopenTaskPatch(), "reopen");
                  await onBroadcastTaskEvent?.(task, "task_reopened", `${actorLabel} reopened “${title}”.`);
                  setReopenOpen(false);
                } catch (e) {
                  console.error(e);
                }
              })()
            }
            onNo={() => setReopenOpen(false)}
          />
        </div>
      )}

      {isWorker && workerFlow !== null && workerFlow !== "postpone" && onTaskActionNotify && (
        <TaskWorkerFlowPanel
          task={task}
          people={people}
          currentUserId={currentUserId}
          flow={workerFlow}
          onClose={() => setWorkerFlow(null)}
          onChange={onChange}
          onNotify={(ids, kind, preview) => void onTaskActionNotify(task, ids, kind, preview)}
          formatDue={formatDue}
          addDaysToDateOnly={addDaysToDateOnly}
        />
      )}

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

      {(taskUpdatesHasContent(task, people) || (isWorker && !completed && !canceled)) && (
        <TaskUpdatesSection
          task={task}
          people={people}
          currentUserId={currentUserId}
          isWorker={isWorker}
          canEditUpdates={isWorker && !completed && !canceled}
          onChange={onChange}
        />
      )}

      <TaskCommentsSection
        task={task}
        people={people}
        currentUserId={currentUserId}
        onChange={onChange}
        onCommentPosted={onCommentPosted}
        onCommentReaction={onCommentReaction}
        onFeedbackReply={async (t, request, body) => {
          await onFeedbackReply?.(t, request, body);
        }}
      />

      <div className="mt-3 border-t border-slate-100 pt-3">
        {!cancelOpen ? (
          workerFlow === "postpone" && onTaskActionNotify ? (
            <TaskWorkerFlowPanel
              task={task}
              people={people}
              currentUserId={currentUserId}
              flow="postpone"
              onClose={() => setWorkerFlow(null)}
              onChange={onChange}
              onNotify={(ids, kind, preview) => void onTaskActionNotify(task, ids, kind, preview)}
              formatDue={formatDue}
              addDaysToDateOnly={addDaysToDateOnly}
            />
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-1 gap-y-1 text-xs leading-tight text-slate-600">
                <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
                  <span className="text-slate-400">For </span>
                  <AssigneeNamesForFooter
                    assigneeIds={task.assigneeIds}
                    assigneeDepartmentIds={task.assigneeDepartmentIds}
                    people={people}
                    currentUserId={currentUserId}
                  />
                </span>
                {(selfAssigned || assignerName) && (
                  <>
                    <span className="text-slate-300" aria-hidden>
                      ·
                    </span>
                    {selfAssigned ? (
                      <span className="text-slate-500">(self assigned)</span>
                    ) : assigner ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <span className="text-slate-400">By </span>
                        <PersonNameInline
                          person={assigner}
                          highlight={task.assignedById === currentUserId}
                        />
                      </span>
                    ) : (
                      <span className="min-w-0">
                        <span className="text-slate-400">By </span>
                        <span className="font-medium text-slate-800">{assignerName}</span>
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!completed && !canceled && (isWorker || isAssigner) && (
                  <button
                    type="button"
                    onClick={() => setWorkerFlow("postpone")}
                    className="task-action-postpone"
                    title="Choose a new due date"
                  >
                    Postpone
                  </button>
                )}
                {!completed && !canceled && canCancelTask && (
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="rounded-md px-2 py-0.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-left shadow-sm">
            <p className="text-xs leading-relaxed text-amber-950">
              Cancelling moves this task to the <span className="font-medium">Canceled</span> tab for everyone. Use it
              when work was abandoned, duplicated, or created by mistake — not when the work is actually done (use{" "}
              <span className="font-medium">Mark complete</span>
              {isWorker ? (
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
                onClick={() =>
                  void (async () => {
                    try {
                      await onCancelTask();
                      setCancelOpen(false);
                    } catch (e) {
                      console.error(e);
                    }
                  })()
                }
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Yes, cancel
              </button>
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="btn-secondary"
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
