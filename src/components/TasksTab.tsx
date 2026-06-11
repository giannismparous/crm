import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import { usePersistedFormDraft } from "../hooks/usePersistedFormDraft";
import { clearFormDraft, readFormDraft } from "../utils/formDraftStorage";
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
import { reportActionError } from "../utils/actionFeedback";
import { isTaskCanceled, isTaskCompleted, isTaskOpen } from "../utils/personTaskStats";
import type { TaskUpdateIntent } from "../utils/personTaskStats";
import { canSeeAllOrgData, type OrgRole } from "../auth/roles";
import { TEAM_DEPARTMENTS, departmentPickerChipClass } from "../types";
import {
  PERSON_AVATAR_INLINE_SIZE,
  PersonAvatarStack,
  PersonNameInline,
  PersonNamesInline,
} from "./PersonAvatar";
import { TaskCommentsSection } from "./TaskCommentsSection";
import { TaskUpdatesSection } from "./TaskUpdatesSection";
import { BufferedTextInput } from "./BufferedTextInput";
import { SimpleRichText, SimpleRichTextView } from "./SimpleRichText";
import { richTextHasContent } from "../utils/richTextImages";
import { newTaskDocId } from "../firebase/firestoreIds";
import { sanitizeTaskUpdates, taskUpdatesToPlainText } from "../utils/sanitizeRichText";
import {
  mergedTaskUpdatesPlainText,
  taskDescriptionContent,
  taskUpdatesHasContent,
} from "../utils/taskUpdates";
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
import {
  UNASSIGNED_PROJECT_COLOR,
  UNASSIGNED_PROJECT_ID,
} from "../utils/projectColors";
import { useI18n, useT } from "../contexts/I18nContext";
import { translatePriority, translateDepartment, departmentMatchesSearch } from "../i18n/helpers";

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

type TaskListSortMode = "urgency" | "project";

const TASKS_NEW_DRAFT_KEY = "tasks:new";

type NewTaskDraftData = {
  title: string;
  description: string;
  assigneeIds: string[];
  assigneeDepartmentIds: string[];
  dueDate: string;
  priority: TaskPriority;
  projectId: string;
  draftTaskId: string;
};

function isNewTaskDraftEmpty(data: NewTaskDraftData): boolean {
  return (
    !data.title.trim() &&
    !data.description.trim() &&
    data.assigneeIds.length === 0 &&
    data.assigneeDepartmentIds.length === 0 &&
    !data.projectId.trim()
  );
}

const TASKS_VIEW_DEFAULTS = {
  scope: "my" as TaskListScope,
  listTab: "open" as TaskListTab,
  query: "",
  everyoneInvolvedFilter: [] as string[],
  everyoneDepartmentFilter: [] as string[],
  everyoneFilterExclusive: false,
  priorityFilter: [] as TaskPriority[],
  taskSortMode: "urgency" as TaskListSortMode,
};

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

function buildProjectTaskGroups(tasks: Task[], projects: Project[], unassignedLabel: string): TaskProjectGroup[] {
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
      label: unassignedLabel,
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
  const t = useT();
  return (
    <div
      className={`flex items-center gap-2 border-b-4 pb-2 ${isFirst ? "pt-0" : "pt-4"}`}
      style={{ borderColor: color }}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <h3 className="text-sm font-semibold" style={{ color }}>
        {label}
      </h3>
      <span className="text-xs tabular-nums text-slate-500">{t("common.taskCount", { count })}</span>
    </div>
  );
}

function priorityTipKey(p: TaskPriority): string {
  return `tasks.priority.${p}Tip`;
}

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
  const t = useT();
  const { locale } = useI18n();

  function toggle(p: TaskPriority) {
    if (value.includes(p)) onChange(value.filter((x) => x !== p));
    else onChange([...value, p]);
  }

  return (
    <div className="segment-track shrink-0" role="group" aria-label={t("tasks.priority.filterAria")}>
      {PRIORITY_ORDER.map((p) => {
        const on = value.includes(p);
        const priorityLabel = translatePriority(locale, p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            title={`${on ? t("common.hide") : t("common.view")} ${priorityLabel} — ${t(priorityTipKey(p))}`}
            aria-label={priorityLabel}
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
  const t = useT();
  const { locale } = useI18n();
  const btn =
    size === "sm"
      ? "h-7 min-w-[2rem] px-1 py-0.5 sm:h-8 sm:min-w-[2.25rem]"
      : "h-8 min-w-[2.25rem] px-1 py-0.5 sm:h-9 sm:min-w-[2.5rem]";
  const icon = size === "sm" ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4 w-4 sm:h-[18px] sm:w-[18px]";
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={t("tasks.priority.aria")}>
      {PRIORITY_ORDER.map((p) => {
        const selected = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            title={t(priorityTipKey(p))}
            aria-label={translatePriority(locale, p)}
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
  const t = useT();
  const { locale } = useI18n();
  if (assigneeIds.length === 0 && assigneeDepartmentIds.length === 0) {
    return <span className="font-medium text-slate-500">{t("common.open")}</span>;
  }

  const assigneePeople = assigneeIds
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p));
  const avatarPeople = assigneeAvatarPeople(assigneeIds, assigneeDepartmentIds, people);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="inline-flex flex-wrap items-center gap-y-1">
        {assigneePeople.length > 0 && (
          <PersonNamesInline people={assigneePeople} currentUserId={currentUserId} />
        )}
        {assigneeDepartmentIds.map((dept, index) => (
          <span key={`d-${dept}`} className="inline-flex items-center">
            {(assigneePeople.length > 0 || index > 0) && (
              <span className="text-slate-500" aria-hidden>
                ,{" "}
              </span>
            )}
            <span className="font-medium text-violet-900">{translateDepartment(locale, dept)}</span>
            <span className="text-slate-500"> {t("common.deptSuffix")}</span>
          </span>
        ))}
      </span>
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
  const t = useT();
  const { locale } = useI18n();
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
    return TEAM_DEPARTMENTS.filter((d) => departmentMatchesSearch(d, search, locale));
  }, [search, locale]);

  function togglePerson(id: string) {
    onChangePeople(personIds.includes(id) ? personIds.filter((x) => x !== id) : [...personIds, id]);
  }

  function toggleDepartment(dept: string) {
    onChangeDepartments(
      departmentIds.includes(dept) ? departmentIds.filter((d) => d !== dept) : [...departmentIds, dept]
    );
  }

  const summary = useMemo(() => {
    if (personIds.length === 0 && departmentIds.length === 0) return t("common.all");
    const bits: string[] = [];
    if (personIds.length === 1) {
      bits.push(people.find((p) => p.id === personIds[0])?.name ?? t("common.onePerson"));
    } else if (personIds.length > 1) bits.push(t("common.nPeople", { count: personIds.length }));
    if (departmentIds.length === 1) bits.push(translateDepartment(locale, departmentIds[0]!));
    else if (departmentIds.length > 1) bits.push(t("common.nDepts", { count: departmentIds.length }));
    return bits.join(", ");
  }, [personIds, departmentIds, people, locale, t]);

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
          <span className="text-slate-400">{t("common.filter")} </span>
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
          aria-label={t("tasks.filterAria")}
        >
          <input
            type="search"
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base mb-1.5 w-full py-1.5 text-xs"
          />
          <div className="max-h-52 overflow-y-auto text-xs">
            {filteredPeople.length > 0 && (
              <>
                <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("common.people")}
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
                  {t("common.departments")}
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
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${departmentPickerChipClass(dept, departmentIds.includes(dept))}`}
                    >
                      {translateDepartment(locale, dept)}
                    </span>
                  </label>
                ))}
              </>
            )}
            {filteredPeople.length === 0 && filteredDepts.length === 0 && (
              <p className="px-1 py-2 text-center text-slate-500">{t("common.noMatches")}</p>
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
              {t("common.clear")}
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
  const t = useT();
  const { locale } = useI18n();
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
    return TEAM_DEPARTMENTS.filter((d) => departmentMatchesSearch(d, search, locale));
  }, [search, locale]);

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
    if (assigneeIds.length === 0 && assigneeDepartmentIds.length === 0) return t("common.open");
    const bits: string[] = [];
    if (assigneeIds.length === 1) {
      bits.push(people.find((p) => p.id === assigneeIds[0])?.name ?? t("common.onePerson"));
    } else if (assigneeIds.length > 1) bits.push(t("common.nPeople", { count: assigneeIds.length }));
    if (assigneeDepartmentIds.length === 1) bits.push(translateDepartment(locale, assigneeDepartmentIds[0]!));
    else if (assigneeDepartmentIds.length > 1) bits.push(t("common.nDepts", { count: assigneeDepartmentIds.length }));
    return bits.join(", ");
  }, [assigneeIds, assigneeDepartmentIds, people, locale, t]);

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
          aria-label={t("tasks.assigneesAria")}
        >
          <input
            type="search"
            placeholder={t("common.searchPeopleDepts")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base mb-1.5 w-full py-1.5 text-xs"
          />
          <div className="max-h-52 overflow-y-auto text-xs">
            {filteredPeople.length > 0 && (
              <>
                <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("common.people")}
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
                  {t("common.departments")}
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
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${departmentPickerChipClass(d, assigneeDepartmentIds.includes(d))}`}
                    >
                      {translateDepartment(locale, d)}
                    </span>
                  </label>
                ))}
              </>
            )}
            {filteredPeople.length === 0 && filteredDepts.length === 0 && (
              <p className="px-1 py-2 text-center text-slate-500">{t("common.noMatches")}</p>
            )}
          </div>
          {(assigneeIds.length > 0 || assigneeDepartmentIds.length > 0) && (
            <button
              type="button"
              className="mt-1.5 w-full rounded-md border border-slate-200 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => onChange([], [])}
            >
              {t("common.clear")}
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
  onAddTask: (
    t: Omit<Task, "id" | "createdAt">,
    options?: { taskId?: string }
  ) => Promise<string | void>;
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
  const t = useT();
  const { locale } = useI18n();
  const saved = useMemo(() => readPersistedTabState("tasks", TASKS_VIEW_DEFAULTS), []);
  const savedNewForm = useMemo(() => readFormDraft<NewTaskDraftData>(TASKS_NEW_DRAFT_KEY), []);
  const [scope, setScope] = useState<TaskListScope>(() => saved.scope);
  const [listTab, setListTab] = useState<TaskListTab>(() => saved.listTab);
  const [query, setQuery] = useState(() => saved.query);
  const [showForm, setShowForm] = useState(() => Boolean(savedNewForm?.open));
  const [everyoneInvolvedFilter, setEveryoneInvolvedFilter] = useState<string[]>(
    () => saved.everyoneInvolvedFilter
  );
  const [everyoneDepartmentFilter, setEveryoneDepartmentFilter] = useState<string[]>(
    () => saved.everyoneDepartmentFilter
  );
  const [everyoneFilterExclusive, setEveryoneFilterExclusive] = useState(
    () => saved.everyoneFilterExclusive
  );
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>(() => saved.priorityFilter);
  const [taskSortMode, setTaskSortMode] = useState<TaskListSortMode>(() => saved.taskSortMode);
  const taskRefs = useRef<Record<string, HTMLLIElement | null>>({});

  usePersistedTabState("tasks", {
    scope,
    listTab,
    query,
    everyoneInvolvedFilter,
    everyoneDepartmentFilter,
    everyoneFilterExclusive,
    priorityFilter,
    taskSortMode,
  });

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
    return tasks.filter((task) => {
      if (listTab === "open" && !isTaskOpen(task)) return false;
      if (listTab === "completed" && !isTaskCompleted(task)) return false;
      if (listTab === "canceled" && !isTaskCanceled(task)) return false;
      if (scope === "my" && canSeeAllOrgData(currentUserOrgRole)) {
        if (!isTaskWorker(task, currentUserId, people)) return false;
      } else if (
        scope === "everyone" &&
        canSeeAllOrgData(currentUserOrgRole) &&
        !taskMatchesEveryoneFilter(
          task,
          everyoneInvolvedFilter,
          everyoneDepartmentFilter,
          everyoneFilterExclusive,
          people
        )
      ) {
        return false;
      }
      if (priorityFilter.length > 0 && !priorityFilter.includes(task.priority)) return false;
      if (!q) return true;
      const projectName = projects.find((p) => p.id === task.projectId)?.name ?? "";
      const blob =
        `${task.title} ${taskUpdatesToPlainText(taskDescriptionContent(task))} ${projectName} ${task.assigneeDepartmentIds.join(" ")} ${mergedTaskUpdatesPlainText(task, people)} ${taskCommentsPlainText(task.comments)} ${translatePriority(locale, task.priority)}`.toLowerCase();
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
    locale,
  ]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => compareTasksByUrgency(a, b, listTab));
  }, [filtered, listTab]);

  const projectGroups = useMemo(() => {
    if (taskSortMode !== "project") return [];
    return buildProjectTaskGroups(sorted, projects, t("tasks.group.unassigned")).map((g) => ({
      ...g,
      tasks: [...g.tasks].sort((a, b) => compareTasksByUrgency(a, b, listTab)),
    }));
  }, [sorted, projects, taskSortMode, listTab, t]);

  const taskStats = useMemo(() => {
    const today = orgTodayDateKey();
    const openTasks = tasks.filter((t) => isTaskOpen(t)).length;
    const overdue = tasks.filter((t) => isTaskOpen(t) && t.dueDate < today).length;
    const completed = tasks.filter((t) => isTaskCompleted(t)).length;
    const canceled = tasks.filter((t) => isTaskCanceled(t)).length;
    return { openTasks, overdue, completed, canceled };
  }, [tasks]);

  async function addTask(payload: Omit<Task, "id" | "createdAt">, options?: { taskId?: string }) {
    await onAddTask(payload, options);
    clearFormDraft(TASKS_NEW_DRAFT_KEY);
    setShowForm(false);
  }

  function updateTask(id: string, patch: Partial<Task>, intent?: TaskUpdateIntent) {
    if (intent === "reopen") setListTab("open");
    return onUpdateTask(id, patch, { intent, actorId: currentUserId }).catch((e) => {
      reportActionError(e instanceof Error ? e.message : t("tasks.card.error.update"));
      throw e;
    });
  }

  function cancelTask(id: string) {
    setListTab("canceled");
    return onCancelTask(id).catch((e) => {
      reportActionError(e instanceof Error ? e.message : t("tasks.card.error.cancel"));
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
              {t("common.back")}
            </button>
          </div>
          <NewTaskForm
            people={people}
            projects={projects}
            currentUserId={currentUserId}
            draftKey={TASKS_NEW_DRAFT_KEY}
            formOpen={showForm}
            onSubmit={(p, opts) => void addTask(p, opts)}
          />
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">{t("tasks.title")}</h2>
                <div
                  className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-tight text-slate-500 sm:gap-x-2 sm:text-xs"
                  aria-label={t("tasks.summaryAria")}
                >
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-indigo-700">{taskStats.openTasks}</span>
                    <span className="font-normal">{t("tasks.tab.open")}</span>
                  </span>
                  <span className="px-0.5 text-slate-300" aria-hidden>
                    |
                  </span>
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-rose-700">{taskStats.overdue}</span>
                    <span className="font-normal">{t("common.overdue")}</span>
                  </span>
                  <span className="px-0.5 text-slate-300" aria-hidden>
                    |
                  </span>
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-emerald-700">{taskStats.completed}</span>
                    <span className="font-normal">{t("common.completed")}</span>
                  </span>
                  <span className="px-0.5 text-slate-300" aria-hidden>
                    |
                  </span>
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-slate-600">{taskStats.canceled}</span>
                    <span className="font-normal">{t("common.canceled")}</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="segment-track">
                  {(
                    [
                      ["open", "tasks.tab.open"],
                      ["completed", "tasks.tab.completed"],
                      ["canceled", "tasks.tab.canceled"],
                    ] as const
                  ).map(([tab, labelKey]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setListTab(tab)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                        listTab === tab ? "segment-tab-active" : "segment-tab-inactive"
                      }`}
                    >
                      {t(labelKey)}
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
                  {t("tasks.scope.my")}
                </button>
                <button
                  type="button"
                  onClick={() => setScope("everyone")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                    scope === "everyone" ? "segment-tab-active" : "segment-tab-inactive"
                  }`}
                >
                  {t("tasks.scope.everyone")}
                </button>
              </span>
              ) : (
                <span className="text-xs font-semibold text-slate-600">{t("tasks.scope.department")}</span>
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
                    title={t("common.exclusiveTitle")}
                  >
                    <input
                      type="checkbox"
                      checked={everyoneFilterExclusive}
                      onChange={(e) => setEveryoneFilterExclusive(e.target.checked)}
                      className="h-3 w-3 shrink-0 rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span className="whitespace-nowrap">{t("common.exclusive")}</span>
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
              {t("tasks.newTask")}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("tasks.search")}
              className="input-base min-w-0 w-full max-w-md py-2 text-sm"
            />
            <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
              <label className="inline-flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap text-xs font-medium text-slate-600 sm:text-sm">{t("common.sortBy")}</span>
                <select
                  value={taskSortMode}
                  onChange={(e) => setTaskSortMode(e.target.value as TaskListSortMode)}
                  className="input-base w-auto min-w-[8.5rem] cursor-pointer py-2 pr-8 text-sm"
                  aria-label={t("common.sortBy")}
                >
                  <option value="urgency">{t("tasks.sort.urgency")}</option>
                  <option value="project">{t("tasks.sort.project")}</option>
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
                      onCancelTask={() => void cancelTask(task.id)}
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
                            onCancelTask={() => void cancelTask(task.id)}
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
                ? t("tasks.empty.open")
                : listTab === "completed"
                  ? t("tasks.empty.completed")
                  : t("tasks.empty.canceled")}
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
  draftKey,
  formOpen = true,
  onSubmit,
}: {
  people: Person[];
  projects: Project[];
  currentUserId: string;
  defaultProjectId?: string;
  lockProject?: boolean;
  draftKey?: string;
  formOpen?: boolean;
  onSubmit: (
    t: Omit<Task, "id" | "createdAt">,
    options: { taskId: string }
  ) => void | Promise<void>;
}) {
  const t = useT();
  const saved = useMemo(
    () => (draftKey ? readFormDraft<NewTaskDraftData>(draftKey) : null),
    [draftKey]
  );
  const [draftTaskId] = useState(() => saved?.data.draftTaskId ?? newTaskDocId());
  const [title, setTitle] = useState(() => saved?.data.title ?? "");
  const [description, setDescription] = useState(() => saved?.data.description ?? "");
  const [descriptionUploading, setDescriptionUploading] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => saved?.data.assigneeIds ?? []);
  const [assigneeDepartmentIds, setAssigneeDepartmentIds] = useState<string[]>(
    () => saved?.data.assigneeDepartmentIds ?? []
  );
  const [dueDate, setDueDate] = useState(() => saved?.data.dueDate ?? orgTodayDateKey());
  const [priority, setPriority] = useState<TaskPriority>(() => saved?.data.priority ?? "medium");
  const [projectId, setProjectId] = useState(
    () => saved?.data.projectId ?? defaultProjectId
  );

  const draftData: NewTaskDraftData = {
    title,
    description,
    assigneeIds,
    assigneeDepartmentIds,
    dueDate,
    priority,
    projectId: lockProject ? defaultProjectId : projectId,
    draftTaskId,
  };

  usePersistedFormDraft(
    draftKey ?? "",
    { open: formOpen, data: draftData },
    { isEmpty: isNewTaskDraftEmpty }
  );

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
      description: sanitizeTaskUpdates(description),
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
      updateEntries: [],
      comments: [],
    };
    const pid = (lockProject ? defaultProjectId : projectId).trim();
    if (pid) payload.projectId = pid;
    await onSubmit(payload, { taskId: draftTaskId });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <p className="text-sm font-semibold text-slate-900">{t("tasks.form.newTask")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label={t("common.title")}>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-base py-2"
          />
        </Field>
        <Field label={t("tasks.form.due")}>
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="input-base py-2"
          />
        </Field>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 block text-xs font-medium text-slate-600">{t("tasks.form.assignTo")}</span>
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
          <span className="mb-1 block text-xs font-medium text-slate-600">{t("tasks.form.priority")}</span>
          <PrioritySegmented value={priority} onChange={setPriority} />
        </div>
        {!lockProject && (
          <Field label={t("tasks.form.project")}>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input-base py-2"
            >
              <option value="">{t("tasks.form.noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="sm:col-span-3">
          <Field label={t("common.description")}>
            <SimpleRichText
              value={description}
              onChange={setDescription}
              authorId={currentUserId}
              collapsible
              collapseKey={`new-task-desc-${draftTaskId}`}
              taskId={draftTaskId}
              inlineImageStorageDir={`tasks/${draftTaskId}/description`}
              enableGenericFileAttach
              onImagesUploadingChange={setDescriptionUploading}
              autoMigratePersisted={false}
              placeholder={t("tasks.form.descriptionPlaceholder")}
            />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={descriptionUploading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim disabled:opacity-50"
        >
          {descriptionUploading ? t("common.uploading") : t("common.create")}
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

function TaskDescriptionSection({
  task,
  canEdit,
  onChange,
}: {
  task: Task;
  canEdit: boolean;
  onChange: (patch: Partial<Task>) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [stayExpanded, setStayExpanded] = useState(false);
  const flushSaveRef = useRef<(() => void) | null>(null);
  const descriptionContent = taskDescriptionContent(task);
  const hasDescription = richTextHasContent(descriptionContent);

  useEffect(() => {
    setEditing(false);
    setStayExpanded(false);
  }, [task.id]);

  function handleSave() {
    flushSaveRef.current?.();
    setStayExpanded(true);
    setEditing(false);
  }

  if (!hasDescription && !canEdit) return null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium text-slate-600">
        {t("common.description")}
        {canEdit && !editing && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="font-normal text-accent hover:underline"
            >
              {t("common.editParen")}
            </button>
          </>
        )}
        {canEdit && editing && (
          <>
            {" "}
            <button
              type="button"
              onClick={handleSave}
              className="font-normal text-accent hover:underline"
            >
              {t("common.saveParen")}
            </button>
          </>
        )}
      </p>
      {editing ? (
        <SimpleRichText
          key={`${task.id}-desc-edit`}
          value={descriptionContent}
          persistedHtml={task.description ?? ""}
          onChange={(description) => onChange({ description })}
          flushSaveRef={flushSaveRef}
          autoFocus
          collapseKey={`${task.id}-desc`}
          taskId={task.id}
          inlineImageStorageDir={`tasks/${task.id}/description`}
          enableGenericFileAttach
          placeholder={t("tasks.form.descriptionPlaceholder")}
        />
      ) : hasDescription ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80">
          <SimpleRichTextView
            html={descriptionContent}
            collapsible={!stayExpanded}
            collapseKey={`${task.id}-desc`}
          />
        </div>
      ) : (
        <p className="text-sm text-slate-400">{t("tasks.form.noDescription")}</p>
      )}
    </div>
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
  const t = useT();
  const { locale } = useI18n();
  const today = orgTodayDateKey();
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
  const canceled = isTaskCanceled(task);
  const completed = isTaskCompleted(task);
  const overdue = isTaskOpen(task) && task.dueDate < today;
  const postponed = task.postponeCount > 0;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [workerFlow, setWorkerFlow] = useState<WorkerFlow>(null);
  const isWorker = isTaskWorker(task, currentUserId, people);
  const isAssigner = task.assignedById === currentUserId;
  const canCancelTask = isAssigner || isWorker;
  const canReopen = currentUserOrgRole === "founder" || isTaskWorker;
  const actorLabel = people.find((p) => p.id === currentUserId)?.name ?? t("common.someone");
  const taskTitle = task.title.trim() || t("common.task");
  const hasOpenFeedback = taskHasOpenFeedback(task);
  const hasFeedbackHistory = taskHasFeedbackHistory(task);
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
            <BufferedTextInput
              entityKey={`${task.id}:title`}
              value={task.title}
              onCommit={(title) => onChange({ title })}
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
            <span className="font-medium text-slate-700">{t("tasks.card.due", { date: formatDue(task.dueDate) })}</span>
            {canceled && (
              <span className="text-slate-600">
                {" · "}
                {t("tasks.card.canceled")}
                {task.canceledAt && ` ${formatDue(task.canceledAt.slice(0, 10))}`}
              </span>
            )}
            {completed && !canceled && task.completedAt && (
              <span className="text-emerald-800">
                {" · "}
                {t("tasks.card.completed", { date: formatDue(task.completedAt.slice(0, 10)) })}
              </span>
            )}
            {overdue && !canceled && (
              <span className="text-rose-700"> · {t("tasks.card.overdue")}</span>
            )}
            {postponed && !canceled && (
              <span className="text-amber-800">
                {" · "}
                <span className="whitespace-nowrap">
                  {t("tasks.card.postponed")}
                  <sup className="ml-0.5 text-[0.7em] font-semibold leading-none tracking-tight">
                    {task.postponeCount}
                  </sup>
                </span>
                <span> {t("tasks.card.postponedWas", { date: formatDue(task.originalDueDate) })}</span>
              </span>
            )}
          </p>
        </div>

        <div
          className="flex w-full max-w-full shrink-0 items-center gap-x-2 gap-y-2 sm:w-auto"
          aria-live="polite"
        >
          {!completed && !canceled ? (
            <>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-2">
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
                        ? t("tasks.card.needsFeedbackOpenTip")
                        : t("tasks.card.needsFeedbackDoneTip")
                    }
                  >
                    {t("tasks.card.needsFeedback")}
                  </span>
                )}
                {isAssigner && (
                  <button
                    type="button"
                    onClick={() =>
                      void (async () => {
                        try {
                          await onChange({ status: "done" }, "mark_complete");
                          await onBroadcastTaskEvent?.(
                            task,
                            "task_marked_complete",
                            t("tasks.notify.markedComplete", { actor: actorLabel, title: taskTitle })
                          );
                        } catch (e) {
                          reportActionError(e instanceof Error ? e.message : t("tasks.card.error.markComplete"));
                        }
                      })()
                    }
                    className="task-action-complete"
                  >
                    {t("common.markComplete")}
                  </button>
                )}
              </div>
              <span
                className={`inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200/70 p-1 shadow-sm priority-badge-ring ${PRIORITY_BADGE[task.priority].pill}`}
                title={t(priorityTipKey(task.priority))}
                role="img"
                aria-label={t("tasks.priority.badgeAria", { priority: translatePriority(locale, task.priority) })}
              >
                <PriorityUrgencyIcon priority={task.priority} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-2">
                {canReopen && completed && !reopenOpen && (
                  <button
                    type="button"
                    onClick={() => setReopenOpen(true)}
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {t("common.reopen")}
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
                        ? t("tasks.card.needsFeedbackOpenTip")
                        : t("tasks.card.needsFeedbackDoneTip")
                    }
                  >
                    {t("tasks.card.needsFeedback")}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {reopenOpen && completed && (
        <div className="mt-3 w-full">
          <ConfirmPanel
            message={t("tasks.card.reopenConfirm")}
            yesLabel={t("tasks.card.yesReopen")}
            noLabel={t("tasks.card.keepCompleted")}
            onYes={() =>
              void (async () => {
                try {
                  await onChange(reopenTaskPatch(), "reopen");
                  await onBroadcastTaskEvent?.(
                    task,
                    "task_reopened",
                    t("tasks.notify.reopened", { actor: actorLabel, title: taskTitle })
                  );
                  setReopenOpen(false);
                } catch (e) {
                  reportActionError(e instanceof Error ? e.message : t("tasks.card.error.reopen"));
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

      <TaskDescriptionSection
        task={task}
        canEdit={isWorker && !completed && !canceled}
        onChange={onChange}
      />

      {(taskUpdatesHasContent(task, people) || (isWorker && !completed && !canceled)) && (
        <TaskUpdatesSection
          task={task}
          people={people}
          projectName={project?.name ?? ""}
          currentUserId={currentUserId}
          isWorker={isWorker}
          canEditUpdates={isWorker && !completed && !canceled}
          onChange={onChange}
        />
      )}

      <TaskCommentsSection
        task={task}
        people={people}
        projects={projects}
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
                  <span className="text-slate-400">{t("common.for")} </span>
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
                      <span className="text-slate-500">{t("common.selfAssigned")}</span>
                    ) : assigner ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <span className="text-slate-400">{t("common.by")} </span>
                        <PersonNameInline
                          person={assigner}
                          highlight={task.assignedById === currentUserId}
                        />
                      </span>
                    ) : (
                      <span className="min-w-0">
                        <span className="text-slate-400">{t("common.by")} </span>
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
                    title={t("tasks.card.postponeTitle")}
                  >
                    {t("tasks.card.postpone")}
                  </button>
                )}
                {!completed && !canceled && canCancelTask && (
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="rounded-md px-2 py-0.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-800"
                  >
                    {t("tasks.card.cancel")}
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-left shadow-sm">
            <p className="text-xs leading-relaxed text-amber-950">{t("tasks.card.cancelExplain")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void (async () => {
                    try {
                      await onCancelTask();
                      setCancelOpen(false);
                    } catch (e) {
                      reportActionError(e instanceof Error ? e.message : t("tasks.card.error.cancel"));
                    }
                  })()
                }
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                {t("tasks.card.yesCancel")}
              </button>
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="btn-secondary"
              >
                {t("tasks.card.keep")}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
