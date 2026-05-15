import { useMemo, useState } from "react";
import type { TabId } from "./types";
import { signOutUser } from "./firebase/config";
import { TabNav } from "./components/TabNav";
import { TasksTab } from "./components/TasksTab";
import { ContactsTab } from "./components/ContactsTab";
import { AuthScreen } from "./components/AuthScreen";
import { CalendarTab } from "./components/CalendarTab";
import { useOrgFirestore } from "./useOrgFirestore";

export default function App() {
  const {
    user,
    authLoading,
    dataLoading,
    error,
    people,
    tasks,
    contacts,
    currentUserPersonId,
    updateTask,
    createTask,
    removeTask,
    addContact,
    updateContact,
    removeContact,
    addReminder,
    updateReminder,
    removeReminder,
  } = useOrgFirestore();

  const [tab, setTab] = useState<TabId>("tasks");

  const currentUserId = currentUserPersonId || people[0]?.id || "";

  const stats = useMemo(() => {
    const openTasks = tasks.filter((t) => t.status !== "done").length;
    const overdue = tasks.filter((t) => {
      if (t.status === "done") return false;
      return t.dueDate < new Date().toISOString().slice(0, 10);
    }).length;
    const pendingReminders = contacts.reduce(
      (n, c) => n + c.reminders.filter((r) => !r.done).length,
      0
    );
    return { openTasks, overdue, pendingReminders, contactCount: contacts.length };
  }, [tasks, contacts]);

  const layoutMax = tab === "calendar" ? "max-w-7xl" : "max-w-6xl";

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen pb-12">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/90 bg-white/90 backdrop-blur-md">
        <div className={`mx-auto flex h-11 items-center justify-between gap-2 px-3 sm:h-12 sm:gap-4 sm:px-6 lg:px-8 ${layoutMax}`}>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="shrink-0 font-display text-sm font-semibold tracking-tight text-slate-900 sm:text-base">
              Team CRM
            </span>
            <TabNav active={tab} onChange={setTab} />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {dataLoading && (
              <span className="hidden text-[10px] text-slate-400 sm:inline" aria-live="polite">
                Syncing…
              </span>
            )}
            {error && (
              <span className="max-w-[140px] truncate text-[10px] text-rose-600 sm:max-w-xs" title={error}>
                {error}
              </span>
            )}
            <CompactStats stats={stats} />
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 sm:text-xs"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto px-4 pb-8 pt-[calc(2.75rem+1rem)] sm:px-6 sm:pt-[calc(3rem+1.25rem)] lg:px-8 ${layoutMax}`}>
        {tab === "tasks" ? (
          <TasksTab
            people={people}
            tasks={tasks}
            onAddTask={createTask}
            onUpdateTask={updateTask}
            onRemoveTask={removeTask}
            currentUserId={currentUserId}
          />
        ) : tab === "contacts" ? (
          <ContactsTab
            contacts={contacts}
            onAddContact={addContact}
            onUpdateContact={updateContact}
            onRemoveContact={removeContact}
            onAddReminder={addReminder}
            onUpdateReminder={updateReminder}
            onRemoveReminder={removeReminder}
          />
        ) : (
          <CalendarTab tasks={tasks} contacts={contacts} currentUserId={currentUserId} />
        )}
      </main>
    </div>
  );
}

function CompactStats({
  stats,
}: {
  stats: { openTasks: number; overdue: number; pendingReminders: number; contactCount: number };
}) {
  const items = [
    { label: "Open", value: stats.openTasks, className: "text-indigo-700" },
    { label: "Overdue", value: stats.overdue, className: "text-rose-700" },
    { label: "Contacts", value: stats.contactCount, className: "text-emerald-700" },
    { label: "Reminders", value: stats.pendingReminders, className: "text-amber-800" },
  ];
  return (
    <div
      className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-[10px] leading-tight text-slate-500 sm:gap-x-2 sm:text-xs"
      aria-label="Summary counts"
    >
      {items.map((item, i) => (
        <span key={item.label} className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
          {i > 0 && <span className="px-0.5 text-slate-300" aria-hidden>|</span>}
          <span className={`tabular-nums font-semibold ${item.className}`}>{item.value}</span>
          <span className="hidden font-normal sm:inline">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
