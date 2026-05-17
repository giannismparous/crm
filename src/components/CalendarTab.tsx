import { useMemo, useState } from "react";
import type { ContactReminder, Person, SalesContact, Task, TaskListScope, TaskStatus } from "../types";
import { isTaskWorker } from "../utils/taskAssignees";
import { isTaskOpen } from "../utils/personTaskStats";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MAX_CHIPS_PER_CELL = 4;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToLocalDateKey(iso: string): string {
  return dateKeyLocal(new Date(iso));
}

function reminderTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type CalendarItem =
  | { kind: "task"; id: string; title: string; status: TaskStatus; dueDate: string; order: number }
  | {
      kind: "reminder";
      id: string;
      title: string;
      contactId: string;
      contactName: string;
      dueAt: string;
      order: number;
      timeLabel: string;
    };

function sortDayItems(a: CalendarItem, b: CalendarItem): number {
  if (a.kind === "task" && b.kind === "reminder") return -1;
  if (a.kind === "reminder" && b.kind === "task") return 1;
  if (a.kind === "task" && b.kind === "task") return a.title.localeCompare(b.title);
  return a.order - b.order;
}

function buildItemsByDay(
  tasks: Task[],
  contacts: SalesContact[],
  people: Person[],
  taskScope: TaskListScope,
  currentUserId: string,
  showReminders: boolean
): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  function push(key: string, item: CalendarItem) {
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }

  const tasksFiltered =
    taskScope === "my" && currentUserId
      ? tasks.filter((t) => isTaskWorker(t, currentUserId, people))
      : tasks;

  for (const t of tasksFiltered) {
    if (!isTaskOpen(t)) continue;
    if (!t.dueDate || t.dueDate.length < 10) continue;
    push(t.dueDate, { kind: "task", id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, order: 0 });
  }

  if (showReminders) {
    for (const c of contacts) {
      const contactName = `${c.firstName} ${c.lastName}`.trim() || c.company || "Contact";
      for (const r of c.reminders) {
        if (r.done) continue;
        const key = isoToLocalDateKey(r.dueAt);
        const d = new Date(r.dueAt);
        const order = Number.isNaN(d.getTime()) ? 0 : d.getTime();
        push(key, {
          kind: "reminder",
          id: r.id,
          title: r.title,
          contactId: c.id,
          contactName,
          dueAt: r.dueAt,
          order,
          timeLabel: reminderTimeLabel(r.dueAt),
        });
      }
    }
  }

  for (const arr of map.values()) {
    arr.sort(sortDayItems);
  }
  return map;
}

/** Monday-first grid cells for one month; null = empty padding cell. */
function monthCells(year: number, monthIndex: number): (number | null)[] {
  const first = new Date(year, monthIndex, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < mondayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells;
}

function monthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

const STATUS_SHORT: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "Doing",
  review: "Review",
  done: "Done",
  canceled: "Canceled",
};

export function CalendarTab({
  tasks,
  contacts,
  people,
  currentUserId,
  onOpenTask,
  onOpenContact,
  onUpdateReminder,
}: {
  tasks: Task[];
  contacts: SalesContact[];
  people: Person[];
  currentUserId: string;
  onOpenTask: (taskId: string) => void;
  onOpenContact: (contactId: string) => void;
  onUpdateReminder: (
    contactId: string,
    reminderId: string,
    patch: Partial<ContactReminder>
  ) => void | Promise<void>;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [taskScope, setTaskScope] = useState<TaskListScope>("my");
  const [showReminders, setShowReminders] = useState(true);
  const [selectedKey, setSelectedKey] = useState(() => dateKeyLocal(new Date()));

  const byDay = useMemo(
    () => buildItemsByDay(tasks, contacts, people, taskScope, currentUserId, showReminders),
    [tasks, contacts, people, taskScope, currentUserId, showReminders]
  );

  const cells = useMemo(() => monthCells(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const todayKey = dateKeyLocal(new Date());
  const selectedItems = selectedKey ? [...(byDay.get(selectedKey) ?? [])].sort(sortDayItems) : [];

  function goToday() {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelectedKey(dateKeyLocal(d));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-inner">
            <button
              type="button"
              onClick={() => setTaskScope("my")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                taskScope === "my" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
              }`}
            >
              My tasks
            </button>
            <button
              type="button"
              onClick={() => setTaskScope("everyone")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                taskScope === "everyone"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600"
              }`}
            >
              Everyone
            </button>
          </span>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={showReminders}
              onChange={(e) => setShowReminders(e.target.checked)}
            />
            Show reminders
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Today
          </button>
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
              aria-label="Previous month"
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
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_min(100%,320px)] lg:items-start">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAYS.map((d, wi) => (
              <div
                key={d}
                className={`border-slate-200 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs ${wi > 0 ? "border-l" : ""}`}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const colStart = i % 7 === 0;
              if (day == null) {
                return (
                  <div
                    key={`e-${i}`}
                    className={`min-h-[5.5rem] border-t border-slate-200 bg-slate-100/90 sm:min-h-[7rem] lg:min-h-[8.5rem] ${colStart ? "" : "border-l"}`}
                  />
                );
              }
              const key = `${cursor.y}-${pad2(cursor.m + 1)}-${pad2(day)}`;
              const items = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;
              const visible = items.slice(0, MAX_CHIPS_PER_CELL);
              const more = items.length - visible.length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  title={`${key}: ${items.length} item(s)`}
                  className={`flex min-h-[5.5rem] flex-col border-t border-slate-200 bg-white p-1 text-left transition sm:min-h-[7rem] sm:p-1.5 lg:min-h-[8.5rem] ${colStart ? "" : "border-l"} ${
                    isSelected ? "z-[1] ring-2 ring-inset ring-indigo-400" : "hover:bg-slate-50/80"
                  } ${isToday && !isSelected ? "bg-indigo-50/40" : ""}`}
                >
                  <div className="flex shrink-0 justify-end">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday ? "bg-indigo-600 text-white" : "text-slate-800"
                      }`}
                    >
                      {day}
                    </span>
                  </div>
                  <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                    {visible.map((item) =>
                      item.kind === "task" ? (
                        <button
                          key={`t-${item.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenTask(item.id);
                          }}
                          className="w-full truncate rounded border-l-[3px] border-indigo-600 bg-indigo-50 px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-indigo-950 hover:bg-indigo-100/80 sm:text-[11px]"
                          title={`${item.title} · ${STATUS_SHORT[item.status]}`}
                        >
                          <span className="block truncate">{item.title}</span>
                        </button>
                      ) : (
                        <button
                          key={`r-${item.contactId}-${item.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenContact(item.contactId);
                          }}
                          className="w-full truncate rounded border-l-[3px] border-amber-600 bg-amber-50 px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-amber-950 hover:bg-amber-100/80 sm:text-[11px]"
                          title={`${item.timeLabel ? item.timeLabel + " · " : ""}${item.title} · ${item.contactName}`}
                        >
                          {item.timeLabel ? (
                            <span className="font-semibold text-amber-900">{item.timeLabel} </span>
                          ) : null}
                          <span className="truncate">{item.title}</span>
                        </button>
                      )
                    )}
                    {more > 0 && (
                      <div className="truncate px-0.5 text-[10px] font-semibold text-slate-500">+{more} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-display text-base font-semibold text-slate-900">
            {selectedKey
              ? new Date(selectedKey + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "Select a day"}
          </h2>
          {selectedItems.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing scheduled for this date.</p>
          ) : (
            <ul className="mt-3 max-h-[min(60vh,28rem)] space-y-2 overflow-y-auto text-sm">
              {selectedItems.map((item) =>
                item.kind === "task" ? (
                  <li key={`t-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(item.id)}
                      className="w-full rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-left ring-1 ring-indigo-100 transition hover:border-indigo-200 hover:bg-indigo-50"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-800">Task</div>
                      <div className="mt-0.5 font-medium text-slate-900">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-600">{STATUS_SHORT[item.status]}</div>
                    </button>
                  </li>
                ) : (
                  <li
                    key={`r-${item.contactId}-${item.id}`}
                    className="rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2 ring-1 ring-amber-100"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenContact(item.contactId)}
                      className="w-full text-left transition hover:opacity-90"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Reminder</div>
                      <div className="mt-0.5 font-medium text-slate-900">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {item.timeLabel ? `${item.timeLabel} · ` : null}
                        {item.contactName}
                      </div>
                    </button>
                    <label
                      className="mt-2 flex cursor-pointer items-center gap-2 border-t border-amber-200/80 pt-2 text-xs text-slate-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          void Promise.resolve(
                            onUpdateReminder(item.contactId, item.id, { done: e.target.checked })
                          ).catch(console.error);
                        }}
                        className="rounded border-slate-300 text-accent focus:ring-accent/30"
                      />
                      Done
                    </label>
                  </li>
                )
              )}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
            <span className="mr-2 inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-indigo-600" /> Tasks
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-amber-600" /> Reminders
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
