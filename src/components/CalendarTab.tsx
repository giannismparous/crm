import { useMemo, useState } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import type {
  Appointment,
  AppointmentRsvpAnswer,
  PersonalReminder,
  Person,
  Project,
  Task,
  TaskListScope,
  TaskPriority,
  TaskStatus,
} from "../types";
import { AppointmentOccurrencePanel } from "./AppointmentOccurrencePanel";
import { buildRsvpPatch } from "../utils/appointmentRsvp";
import {
  getOccurrenceLocation,
  getOccurrenceReviewItems,
} from "../utils/appointmentOccurrenceFields";
import type { AppointmentCancelScope } from "../utils/appointmentOccurrence";
import { getFirestoreDb, SIMASIA_AI_ORG_ID } from "../firebase/config";
import { markAppointmentRsvpNotificationRead } from "../firebase/notifications";
import { PriorityFilter, PriorityUrgencyIcon, TASK_PRIORITY_CALENDAR_CHIP } from "./TasksTab";
import { useI18n, useT } from "../contexts/I18nContext";
import { translatePriority, translateTaskStatus } from "../i18n/helpers";
import { isPersonalReminderRelevantToPerson } from "../utils/personalReminderLinks";
import {
  formatAppointmentTimeRange,
  isAppointmentRelevantToPerson,
  isAppointmentScheduled,
} from "../utils/appointments";
import { appointmentsForCalendarView } from "../utils/appointmentDisplay";
import { tasksForCalendarView } from "../utils/taskDisplay";
import { taskInvolvesPerson } from "../utils/taskAssignees";
import {
  datetimeLocalToIso,
  formatInOrgTime,
  orgDateKey,
  orgTodayDateKey,
  orgWeekday,
  orgYmdAddDays,
} from "../utils/orgTimezone";

const WEEKDAY_KEYS = [
  "calendar.weekday.mon",
  "calendar.weekday.tue",
  "calendar.weekday.wed",
  "calendar.weekday.thu",
  "calendar.weekday.fri",
  "calendar.weekday.sat",
  "calendar.weekday.sun",
] as const;

const MAX_CHIPS_PER_CELL = 4;

/** Distinct from task priority colors (rose / orange / indigo / emerald). */
const APPOINTMENT_CHIP = {
  stripe: "border-cyan-600",
  bg: "bg-cyan-50",
  hover: "hover:bg-cyan-100/80",
  text: "text-cyan-950",
  time: "text-cyan-900",
  label: "text-cyan-800",
  ring: "ring-cyan-100",
  border: "border-cyan-100",
  hoverBorder: "hover:border-cyan-200",
  hoverBg: "hover:bg-cyan-50",
  checkbox: "text-cyan-600 focus:ring-cyan-500",
  legend: "bg-cyan-600",
  divider: "border-cyan-200/80",
} as const;

const REMINDER_CHIP = {
  stripe: "border-fuchsia-600",
  bg: "bg-fuchsia-50",
  hover: "hover:bg-fuchsia-100/80",
  text: "text-fuchsia-950",
  time: "text-fuchsia-900",
  label: "text-fuchsia-800",
  ring: "ring-fuchsia-100",
  border: "border-fuchsia-100",
  hoverBorder: "hover:border-fuchsia-200",
  hoverBg: "hover:bg-fuchsia-50",
  checkbox: "text-fuchsia-600 focus:ring-fuchsia-500",
  legend: "bg-fuchsia-600",
  divider: "border-fuchsia-200/80",
} as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoToLocalDateKey(iso: string): string {
  return orgDateKey(iso);
}

function reminderTimeLabel(iso: string): string {
  return formatInOrgTime(iso, { hour: "numeric", minute: "2-digit" });
}

function appointmentDetailLine(apt: Appointment, occurrenceIndex: number): string | undefined {
  const parts: string[] = [];
  const location = getOccurrenceLocation(apt, occurrenceIndex).trim();
  const review = getOccurrenceReviewItems(apt, occurrenceIndex);
  if (location) parts.push(location);
  if (review.length > 0) parts.push(review[0]!);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

type CalendarItem =
  | {
      kind: "appointment";
      id: string;
      title: string;
      startsAt: string;
      occurrenceIndex: number;
      order: number;
      timeLabel: string;
      detailLine?: string;
      projectName?: string;
      projectColor?: string;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
      dueDate: string;
      occurrenceIndex: number;
      projectName?: string;
      projectColor?: string;
      order: number;
    }
  | {
      kind: "reminder";
      id: string;
      title: string;
      dueAt: string;
      order: number;
      timeLabel: string;
    };

const KIND_ORDER: Record<CalendarItem["kind"], number> = {
  appointment: 0,
  task: 1,
  reminder: 2,
};

function sortDayItems(a: CalendarItem, b: CalendarItem): number {
  const ka = KIND_ORDER[a.kind];
  const kb = KIND_ORDER[b.kind];
  if (ka !== kb) return ka - kb;
  if (a.kind === "appointment" && b.kind === "appointment") return a.order - b.order;
  if (a.kind === "task" && b.kind === "task") return a.title.localeCompare(b.title);
  if (a.kind === "reminder" && b.kind === "reminder") return a.order - b.order;
  return 0;
}

function buildItemsByDay(
  appointments: Appointment[],
  tasks: Task[],
  projects: Project[],
  personalReminders: PersonalReminder[],
  people: Person[],
  scope: TaskListScope,
  currentUserId: string,
  seesAllOrgData: boolean,
  showAppointments: boolean,
  showTasks: boolean,
  showReminders: boolean,
  priorityFilter: TaskPriority[]
): Map<string, CalendarItem[]> {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const map = new Map<string, CalendarItem[]>();
  function push(key: string, item: CalendarItem) {
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }

  if (showAppointments) {
    const aptsFiltered =
      scope === "my" && currentUserId
        ? appointments.filter((a) => isAppointmentRelevantToPerson(a, currentUserId, people))
        : appointments;
    for (const item of appointmentsForCalendarView(aptsFiltered)) {
      const { appointment: a, startsAt, endsAt, occurrenceIndex } = item;
      if (!startsAt) continue;
      const key = isoToLocalDateKey(startsAt);
      const project = a.projectId ? projectById.get(a.projectId) : undefined;
      push(key, {
        kind: "appointment",
        id: a.id,
        title: a.title,
        startsAt,
        occurrenceIndex,
        order: new Date(startsAt).getTime(),
        timeLabel: formatAppointmentTimeRange({ ...a, startsAt, endsAt }),
        detailLine: appointmentDetailLine(a, occurrenceIndex),
        projectName: project?.name,
        projectColor: project?.color,
      });
    }
  }

  if (showTasks) {
    const tasksFiltered =
      scope === "my" && currentUserId && seesAllOrgData
        ? tasks.filter((t) => taskInvolvesPerson(t, currentUserId, people))
        : tasks;

    for (const item of tasksForCalendarView(tasksFiltered)) {
      const { task: t, dueDate, occurrenceIndex } = item;
      if (!dueDate || dueDate.length < 10) continue;
      if (priorityFilter.length > 0 && !priorityFilter.includes(t.priority)) continue;
      const project = t.projectId ? projectById.get(t.projectId) : undefined;
      push(dueDate, {
        kind: "task",
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate,
        occurrenceIndex,
        projectName: project?.name,
        projectColor: project?.color,
        order: occurrenceIndex,
      });
    }
  }

  if (showReminders && currentUserId) {
    for (const r of personalReminders) {
      if (r.done) continue;
      if (!isPersonalReminderRelevantToPerson(r, currentUserId, people)) continue;
      const key = isoToLocalDateKey(r.dueAt);
      const d = new Date(r.dueAt);
      const order = Number.isNaN(d.getTime()) ? 0 : d.getTime();
      push(key, {
        kind: "reminder",
        id: r.id,
        title: r.title,
        dueAt: r.dueAt,
        order,
        timeLabel: reminderTimeLabel(r.dueAt),
      });
    }
  }

  for (const arr of map.values()) {
    arr.sort(sortDayItems);
  }
  return map;
}

type MonthGridCell = {
  key: string;
  day: number;
  inMonth: boolean;
};

/** Monday-first 6-week grid; leading/trailing days belong to adjacent months. */
function monthGridCells(year: number, monthIndex: number): MonthGridCell[] {
  const mondayOffset = (orgWeekday(year, monthIndex, 1) + 6) % 7;
  let { year: y, monthIndex: m, day: d } = orgYmdAddDays(year, monthIndex, 1, -mondayOffset);
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push({
      key: `${y}-${pad2(m + 1)}-${pad2(d)}`,
      day: d,
      inMonth: y === year && m === monthIndex,
    });
    ({ year: y, monthIndex: m, day: d } = orgYmdAddDays(y, m, d, 1));
  }
  return cells;
}

function monthTitle(year: number, monthIndex: number): string {
  const iso = datetimeLocalToIso(`${year}-${pad2(monthIndex + 1)}-01T12:00`);
  return formatInOrgTime(iso, { month: "long", year: "numeric" });
}

function taskChipStyle(priority: TaskPriority) {
  return TASK_PRIORITY_CALENDAR_CHIP[priority];
}

function calendarStatusLabel(locale: ReturnType<typeof useI18n>["locale"], status: TaskStatus): string {
  const key = status === "in_progress" ? "doing" : status;
  return translateTaskStatus(locale, key);
}

export function CalendarTab({
  appointments,
  tasks,
  projects,
  personalReminders,
  people,
  currentUserId,
  seesAllOrgData = true,
  onOpenAppointment: _onOpenAppointment,
  onEditAppointment,
  onOpenTask,
  onUpdateAppointment,
  onCancelAppointmentOccurrence,
  onUpdatePersonalReminder,
  onOpenPersonalReminder,
}: {
  appointments: Appointment[];
  tasks: Task[];
  projects: Project[];
  personalReminders: PersonalReminder[];
  people: Person[];
  currentUserId: string;
  seesAllOrgData?: boolean;
  onOpenAppointment: (appointmentId: string, occurrenceIndex?: number) => void;
  onEditAppointment?: (appointmentId: string, occurrenceIndex?: number) => void;
  onOpenTask: (taskId: string) => void;
  onUpdateAppointment: (id: string, patch: Partial<Appointment>) => Promise<void>;
  onCancelAppointmentOccurrence: (
    id: string,
    occurrenceIndex: number,
    scope: AppointmentCancelScope
  ) => Promise<void>;
  onUpdatePersonalReminder: (
    reminderId: string,
    patch: Partial<PersonalReminder>
  ) => void | Promise<void>;
  onOpenPersonalReminder: () => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const CALENDAR_VIEW_DEFAULTS = useMemo(
    () => ({
      scope: "my" as TaskListScope,
      showAppointments: true,
      showTasks: true,
      showReminders: true,
      priorityFilter: [] as TaskPriority[],
      cursorY: new Date().getFullYear(),
      cursorM: new Date().getMonth(),
      selectedKey: orgTodayDateKey(),
    }),
    []
  );
  const saved = useMemo(
    () => readPersistedTabState("calendar", CALENDAR_VIEW_DEFAULTS),
    [CALENDAR_VIEW_DEFAULTS]
  );
  const [cursor, setCursor] = useState(() => ({ y: saved.cursorY, m: saved.cursorM }));
  const [scope, setScope] = useState<TaskListScope>(() => saved.scope);
  const [showAppointments, setShowAppointments] = useState(() => saved.showAppointments);
  const [showTasks, setShowTasks] = useState(() => saved.showTasks);
  const [showReminders, setShowReminders] = useState(() => saved.showReminders);
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>(() => saved.priorityFilter);
  const [selectedKey, setSelectedKey] = useState(() => saved.selectedKey);
  const [focusedAppointment, setFocusedAppointment] = useState<{
    id: string;
    occurrenceIndex: number;
  } | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const focusedApt = useMemo(
    () => (focusedAppointment ? appointments.find((a) => a.id === focusedAppointment.id) ?? null : null),
    [appointments, focusedAppointment]
  );

  usePersistedTabState("calendar", {
    scope,
    showAppointments,
    showTasks,
    showReminders,
    priorityFilter,
    cursorY: cursor.y,
    cursorM: cursor.m,
    selectedKey,
  });

  const byDay = useMemo(
    () =>
      buildItemsByDay(
        appointments,
        tasks,
        projects,
        personalReminders,
        people,
        scope,
        currentUserId,
        seesAllOrgData,
        showAppointments,
        showTasks,
        showReminders,
        priorityFilter
      ),
    [
      appointments,
      tasks,
      projects,
      personalReminders,
      people,
      scope,
      currentUserId,
      seesAllOrgData,
      showAppointments,
      showTasks,
      showReminders,
      priorityFilter,
    ]
  );

  const cells = useMemo(() => monthGridCells(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const todayKey = orgTodayDateKey();
  const selectedItems = selectedKey ? [...(byDay.get(selectedKey) ?? [])].sort(sortDayItems) : [];

  function goToday() {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelectedKey(orgDateKey(d));
  }

  function openAppointmentDetail(id: string, occurrenceIndex: number) {
    setFocusedAppointment({ id, occurrenceIndex });
  }

  async function handleRsvp(answer: AppointmentRsvpAnswer) {
    if (!focusedApt || !focusedAppointment) return;
    setRsvpBusy(true);
    try {
      await onUpdateAppointment(
        focusedApt.id,
        buildRsvpPatch(focusedApt, focusedAppointment.occurrenceIndex, currentUserId, answer)
      );
      await markAppointmentRsvpNotificationRead(
        getFirestoreDb(),
        SIMASIA_AI_ORG_ID,
        focusedApt.id,
        focusedAppointment.occurrenceIndex,
        currentUserId
      );
    } finally {
      setRsvpBusy(false);
    }
  }

  async function handleCancel(scope: AppointmentCancelScope) {
    if (!focusedAppointment) return;
    setCancelBusy(true);
    try {
      await onCancelAppointmentOccurrence(
        focusedAppointment.id,
        focusedAppointment.occurrenceIndex,
        scope
      );
      setFocusedAppointment(null);
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {seesAllOrgData ? (
            <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => setScope("my")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                  scope === "my" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
                }`}
              >
                {t("calendar.scope.my")}
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
                {t("common.everyone")}
              </button>
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-600">{t("calendar.scope.my")}</span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              <input
                type="checkbox"
                className={`rounded border-slate-300 ${APPOINTMENT_CHIP.checkbox}`}
                checked={showAppointments}
                onChange={(e) => setShowAppointments(e.target.checked)}
              />
              {t("calendar.filter.appointments")}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              <input
                type="checkbox"
                className={`rounded border-slate-300 ${REMINDER_CHIP.checkbox}`}
                checked={showReminders}
                onChange={(e) => setShowReminders(e.target.checked)}
              />
              {t("calendar.filter.reminders")}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={showTasks}
                onChange={(e) => setShowTasks(e.target.checked)}
              />
              {t("calendar.filter.tasks")}
            </label>
            {showTasks && (
              <PriorityFilter value={priorityFilter} onChange={setPriorityFilter} />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          {selectedKey !== todayKey && (
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {t("common.today")}
            </button>
          )}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() =>
                setCursor((c) => {
                  const d = new Date(c.y, c.m - 1, 1);
                  return { y: d.getFullYear(), m: d.getMonth() };
                })
              }
              className="rounded-md px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100"
              aria-label={t("calendar.prevMonth")}
            >
              ‹
            </button>
            <span className="min-w-[10rem] px-2 text-center text-sm font-semibold text-slate-900">
              {monthTitle(cursor.y, cursor.m)}
            </span>
            <button
              type="button"
              onClick={() =>
                setCursor((c) => {
                  const d = new Date(c.y, c.m + 1, 1);
                  return { y: d.getFullYear(), m: d.getMonth() };
                })
              }
              className="rounded-md px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100"
              aria-label={t("calendar.nextMonth")}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_min(100%,320px)] lg:items-start">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAY_KEYS.map((key, wi) => (
              <div
                key={key}
                className={`border-slate-200 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs ${wi > 0 ? "border-l" : ""}`}
              >
                {t(key)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const colStart = i % 7 === 0;
              const items = byDay.get(cell.key) ?? [];
              const isToday = cell.key === todayKey;
              const isSelected = cell.key === selectedKey;
              const visible = items.slice(0, MAX_CHIPS_PER_CELL);
              const more = items.length - visible.length;
              return (
                <div
                  key={cell.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedKey(cell.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedKey(cell.key);
                    }
                  }}
                  title={t("calendar.cellTitle", { date: cell.key, count: String(items.length) })}
                  className={`flex min-h-[5.5rem] cursor-pointer flex-col border-t border-slate-200 p-1 text-left transition sm:min-h-[7rem] sm:p-1.5 lg:min-h-[8.5rem] ${colStart ? "" : "border-l"} ${
                    cell.inMonth ? "bg-white" : "bg-slate-100/90"
                  } ${isSelected ? "z-[1] ring-2 ring-inset ring-indigo-400" : cell.inMonth ? "hover:bg-slate-50/80" : "hover:bg-slate-100"} ${
                    isToday && !isSelected && cell.inMonth ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <div className="flex shrink-0 justify-end">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday
                          ? "bg-indigo-600 text-white"
                          : cell.inMonth
                            ? "text-slate-800"
                            : "text-slate-400"
                      }`}
                    >
                      {cell.day}
                    </span>
                  </div>
                  <div className={`mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden ${cell.inMonth ? "" : "opacity-90"}`}>
                    {visible.map((item) =>
                      item.kind === "appointment" ? (
                        <button
                          key={`a-${item.id}-${item.occurrenceIndex}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAppointmentDetail(item.id, item.occurrenceIndex);
                          }}
                          className={`w-full truncate rounded border-l-[3px] px-1 py-0.5 text-left text-[10px] font-medium leading-tight sm:text-[11px] ${APPOINTMENT_CHIP.stripe} ${APPOINTMENT_CHIP.bg} ${APPOINTMENT_CHIP.text} ${APPOINTMENT_CHIP.hover}`}
                          title={`${item.projectName ? `${item.projectName} · ` : ""}${item.timeLabel ? item.timeLabel + " · " : ""}${item.title}${item.detailLine ? " · " + item.detailLine : ""}`}
                        >
                          {item.timeLabel ? (
                            <span className={`font-semibold ${APPOINTMENT_CHIP.time}`}>{item.timeLabel} </span>
                          ) : null}
                          <span className="flex min-w-0 items-center gap-0.5">
                            {item.projectName ? (
                              <>
                                <span
                                  className="shrink-0 font-semibold"
                                  style={{ color: item.projectColor }}
                                >
                                  {item.projectName}
                                </span>
                                <span className="shrink-0 text-slate-400">·</span>
                              </>
                            ) : null}
                            <span className="truncate">{item.title}</span>
                          </span>
                        </button>
                      ) : item.kind === "task" ? (
                        (() => {
                          const chip = taskChipStyle(item.priority);
                          return (
                            <button
                              key={`t-${item.id}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTask(item.id);
                              }}
                              className={`w-full truncate rounded border-l-[3px] px-1 py-0.5 text-left text-[10px] font-medium leading-tight sm:text-[11px] ${chip.stripe} ${chip.bg} ${chip.text} ${chip.hover}`}
                              title={`${item.projectName ? `${item.projectName} · ` : ""}${translatePriority(locale, item.priority)} · ${item.title} · ${calendarStatusLabel(locale, item.status)}`}
                            >
                              <span className="flex min-w-0 items-center gap-0.5">
                                <PriorityUrgencyIcon
                                  priority={item.priority}
                                  className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5"
                                />
                                {item.projectName ? (
                                  <>
                                    <span
                                      className="shrink-0 font-semibold"
                                      style={{ color: item.projectColor }}
                                    >
                                      {item.projectName}
                                    </span>
                                    <span className="shrink-0 text-slate-400">·</span>
                                  </>
                                ) : null}
                                <span className="truncate">{item.title}</span>
                              </span>
                            </button>
                          );
                        })()
                      ) : (
                        <button
                          key={`r-${item.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPersonalReminder();
                          }}
                          className={`w-full truncate rounded border-l-[3px] px-1 py-0.5 text-left text-[10px] font-medium leading-tight sm:text-[11px] ${REMINDER_CHIP.stripe} ${REMINDER_CHIP.bg} ${REMINDER_CHIP.text} ${REMINDER_CHIP.hover}`}
                          title={`${item.timeLabel ? item.timeLabel + " · " : ""}${item.title}`}
                        >
                          {item.timeLabel ? (
                            <span className={`font-semibold ${REMINDER_CHIP.time}`}>{item.timeLabel} </span>
                          ) : null}
                          <span className="truncate">{item.title}</span>
                        </button>
                      )
                    )}
                    {more > 0 && (
                      <div className="truncate px-0.5 text-[10px] font-semibold text-slate-500">
                        {t("calendar.moreChips", { count: String(more) })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="hidden min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
          {focusedApt && focusedAppointment ? (
            <div className="max-h-[min(70vh,32rem)] overflow-x-hidden overflow-y-auto">
              <button
                type="button"
                onClick={() => setFocusedAppointment(null)}
                className="mb-3 text-xs font-medium text-accent hover:underline"
              >
                {t("calendar.backToDay")}
              </button>
              <AppointmentOccurrencePanel
                appointment={focusedApt}
                people={people}
                projects={projects}
                currentUserId={currentUserId}
                occurrenceIndex={focusedAppointment.occurrenceIndex}
                onOccurrenceIndexChange={(index) =>
                  setFocusedAppointment((prev) => (prev ? { ...prev, occurrenceIndex: index } : prev))
                }
                onRsvp={handleRsvp}
                onCancel={handleCancel}
                allTasks={tasks}
                onOpenTask={onOpenTask}
                rsvpBusy={rsvpBusy}
                cancelBusy={cancelBusy}
                onEdit={
                  isAppointmentScheduled(focusedApt)
                    ? () =>
                        onEditAppointment?.(focusedApt.id, focusedAppointment.occurrenceIndex)
                    : undefined
                }
              />
            </div>
          ) : (
            <>
          <h2 className="font-display text-base font-semibold text-slate-900">
            {selectedKey
              ? formatInOrgTime(datetimeLocalToIso(`${selectedKey}T12:00`), {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : t("calendar.selectDay")}
          </h2>
          {selectedItems.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("calendar.nothingScheduled")}</p>
          ) : (
            <ul className="mt-3 max-h-[min(60vh,28rem)] space-y-2 overflow-y-auto text-sm">
              {selectedItems.map((item) =>
                item.kind === "appointment" ? (
                  <li key={`a-${item.id}-${item.occurrenceIndex}`}>
                    <button
                      type="button"
                      onClick={() => openAppointmentDetail(item.id, item.occurrenceIndex)}
                      className={`w-full rounded-lg border px-3 py-2 text-left ring-1 transition ${APPOINTMENT_CHIP.border} ${APPOINTMENT_CHIP.bg}/80 ${APPOINTMENT_CHIP.ring} ${APPOINTMENT_CHIP.hoverBorder} ${APPOINTMENT_CHIP.hoverBg}`}
                    >
                      <div className={`text-[10px] font-bold uppercase tracking-wide ${APPOINTMENT_CHIP.label}`}>
                        {t("calendar.item.appointment")}
                      </div>
                      <div className="mt-0.5 font-medium text-slate-900">{item.title}</div>
                      {item.timeLabel ? (
                        <div className="mt-1 text-xs text-slate-600">{item.timeLabel}</div>
                      ) : null}
                      {item.detailLine ? (
                        <div className="mt-1 truncate text-xs text-slate-500">{item.detailLine}</div>
                      ) : null}
                    </button>
                  </li>
                ) : item.kind === "task" ? (
                  (() => {
                    const chip = taskChipStyle(item.priority);
                    return (
                      <li key={`t-${item.id}`}>
                        <button
                          type="button"
                          onClick={() => onOpenTask(item.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left ring-1 transition ${chip.border} ${chip.bg}/80 ${chip.ring} ${chip.hover}`}
                          title={t(`tasks.priority.${item.priority}Tip`)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className={`text-[10px] font-bold uppercase tracking-wide ${chip.label}`}>
                              {t("calendar.item.task")}
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-semibold ${chip.label}`}
                            >
                              <PriorityUrgencyIcon priority={item.priority} className="h-3.5 w-3.5" />
                              {translatePriority(locale, item.priority)}
                            </span>
                          </div>
                          {item.projectName ? (
                            <div
                              className="mt-0.5 text-xs font-semibold"
                              style={{ color: item.projectColor }}
                            >
                              {item.projectName}
                            </div>
                          ) : null}
                          <div className="mt-0.5 font-medium text-slate-900">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-600">{calendarStatusLabel(locale, item.status)}</div>
                        </button>
                      </li>
                    );
                  })()
                ) : (
                  <li
                    key={`r-${item.id}`}
                    className={`rounded-lg border px-3 py-2 ring-1 ${REMINDER_CHIP.border} ${REMINDER_CHIP.bg}/90 ${REMINDER_CHIP.ring}`}
                  >
                    <button
                      type="button"
                      onClick={onOpenPersonalReminder}
                      className="w-full text-left transition hover:opacity-90"
                    >
                      <div className={`text-[10px] font-bold uppercase tracking-wide ${REMINDER_CHIP.label}`}>
                        {t("calendar.item.reminder")}
                      </div>
                      <div className="mt-0.5 font-medium text-slate-900">{item.title}</div>
                      {item.timeLabel ? (
                        <div className="mt-1 text-xs text-slate-600">{item.timeLabel}</div>
                      ) : null}
                    </button>
                    <label
                      className={`mt-2 flex cursor-pointer items-center gap-2 border-t pt-2 text-xs text-slate-600 ${REMINDER_CHIP.divider}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          void Promise.resolve(
                            onUpdatePersonalReminder(item.id, { done: e.target.checked })
                          ).catch(console.error);
                        }}
                        className="rounded border-slate-300 text-accent focus:ring-accent/30"
                      />
                      {t("common.done")}
                    </label>
                  </li>
                )
              )}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-sm ${APPOINTMENT_CHIP.legend}`} /> {t("calendar.legend.appointments")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-rose-600" /> {t("calendar.legend.urgent")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-orange-600" /> {t("calendar.legend.high")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-indigo-600" /> {t("calendar.legend.medium")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-emerald-600" /> {t("calendar.legend.low")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-sm ${REMINDER_CHIP.legend}`} /> {t("calendar.legend.reminders")}
            </span>
          </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
