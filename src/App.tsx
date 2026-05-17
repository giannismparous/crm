import { useMemo, useState } from "react";
import type { TabId } from "./types";
import { TabNav } from "./components/TabNav";
import { TasksTab } from "./components/TasksTab";
import { ContactsTab } from "./components/ContactsTab";
import { AuthScreen } from "./components/AuthScreen";
import { CalendarTab } from "./components/CalendarTab";
import { TeamTab } from "./components/TeamTab";
import { NotificationsBell } from "./components/NotificationsBell";
import { SettingsModal } from "./components/SettingsPanel";
import { UserAccountMenu } from "./components/UserAccountMenu";
import { useOrgFirestore } from "./useOrgFirestore";
import type { AppNotification } from "./types";

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
    currentUserOrgRole,
    updateTask,
    createTask,
    cancelTask,
    addContact,
    updateContact,
    removeContact,
    addReminder,
    updateReminder,
    removeReminder,
    updatePerson,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    notifyTaskComment,
    notifyCommentReaction,
    notifyTaskAction,
    notifyTaskFeedbackReply,
    notifyEveryoneAboutTask,
    registrationSeeds,
    canAccessSettings,
    issueRegistrationSeed,
    updatePersonOrgRole,
  } = useOrgFirestore();

  const [tab, setTab] = useState<TabId>("tasks");
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusContactId, setFocusContactId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function openNotification(n: AppNotification) {
    setTab("tasks");
    setFocusTaskId(n.taskId);
  }

  function openTaskFromCalendar(taskId: string) {
    setTab("tasks");
    setFocusTaskId(taskId);
  }

  function openContactFromCalendar(contactId: string) {
    setTab("contacts");
    setFocusContactId(contactId);
  }

  const currentUserId = currentUserPersonId || people[0]?.id || "";

  const currentUserName = useMemo(() => {
    const person = people.find((p) => p.id === currentUserPersonId);
    if (person?.name.trim()) return person.name.trim();
    if (user?.displayName?.trim()) return user.displayName.trim();
    if (user?.email) return user.email.split("@")[0] ?? user.email;
    return "Signed in";
  }, [people, currentUserPersonId, user]);

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
            <NotificationsBell
              notifications={notifications}
              onSelect={openNotification}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
            />
            <UserAccountMenu
              name={currentUserName}
              email={user?.email}
              canOpenSettings={canAccessSettings}
              onOpenSettings={() => setSettingsOpen(true)}
            />
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
            onCancelTask={(id) => cancelTask(id, currentUserPersonId)}
            onCommentPosted={notifyTaskComment}
            onCommentReaction={notifyCommentReaction}
            onTaskActionNotify={notifyTaskAction}
            onFeedbackReply={notifyTaskFeedbackReply}
            currentUserId={currentUserId}
            currentUserOrgRole={currentUserOrgRole}
            onBroadcastTaskEvent={notifyEveryoneAboutTask}
            focusTaskId={focusTaskId}
            onFocusTaskHandled={() => setFocusTaskId(null)}
          />
        ) : tab === "team" ? (
          <TeamTab people={people} currentUserId={currentUserId} onUpdatePerson={updatePerson} />
        ) : tab === "contacts" ? (
          <ContactsTab
            contacts={contacts}
            onAddContact={addContact}
            onUpdateContact={updateContact}
            onRemoveContact={removeContact}
            onAddReminder={addReminder}
            onUpdateReminder={updateReminder}
            onRemoveReminder={removeReminder}
            focusContactId={focusContactId}
            onFocusContactHandled={() => setFocusContactId(null)}
          />
        ) : (
          <CalendarTab
            tasks={tasks}
            contacts={contacts}
            people={people}
            currentUserId={currentUserId}
            onOpenTask={openTaskFromCalendar}
            onOpenContact={openContactFromCalendar}
            onUpdateReminder={updateReminder}
          />
        )}
      </main>

      {canAccessSettings && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          people={people}
          seeds={registrationSeeds}
          currentUserId={currentUserId}
          onCreateSeed={issueRegistrationSeed}
          onUpdateOrgRole={updatePersonOrgRole}
        />
      )}
    </div>
  );
}
