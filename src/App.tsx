import { useCallback, useEffect, useMemo, useState } from "react";
import type { TabId } from "./types";
import { AppBrand } from "./components/AppBrand";
import { TabNav } from "./components/TabNav";
import { TasksTab } from "./components/TasksTab";
import { AppointmentsTab } from "./components/AppointmentsTab";
import { ContactsTab } from "./components/ContactsTab";
import { AuthScreen } from "./components/AuthScreen";
import { ProfileSetupScreen } from "./components/ProfileSetupScreen";
import { CalendarTab } from "./components/CalendarTab";
import { PersonalRemindersTab } from "./components/PersonalRemindersTab";
import { ProjectsTab } from "./components/ProjectsTab";
import { TeamTab } from "./components/TeamTab";
import { NotificationsBell } from "./components/NotificationsBell";
import { SettingsModal } from "./components/SettingsPanel";
import { UserAccountMenu } from "./components/UserAccountMenu";
import { useNotificationAlerts } from "./hooks/useNotificationAlerts";
import { useOrgFirestore } from "./useOrgFirestore";
import type { AppNotification } from "./types";
import { SyncingProgressBar } from "./components/SyncingProgressBar";
import { needsProfileSetup } from "./utils/profileSetup";
import { useUserAppearance } from "./hooks/useAppearance";
import { useTimezone } from "./hooks/useTimezone";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { hasCrmDeepLink, parseCrmDeepLink } from "./utils/crmDeepLink";
import { readTabFromLocation, stripCrmItemParams, writeTabToLocation } from "./utils/crmUrlState";

function App() {
  const {
    user,
    authLoading,
    dataLoading,
    error,
    people,
    tasks,
    projects,
    contacts,
    appointments,
    personalReminders,
    currentUserPersonId,
    currentUserOrgRole,
    updateTask,
    createTask,
    cancelTask,
    createProject,
    updateProject,
    removeProject,
    addContact,
    updateContact,
    removeContact,
    addReminder,
    updateReminder,
    removeReminder,
    addPersonalReminder,
    updatePersonalReminder,
    removePersonalReminder,
    createAppointment,
    updateAppointment,
    cancelAppointment,
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
    canManageProjects,
    seesAllOrgData,
    issueRegistrationSeed,
    completeProfileSetup,
  } = useOrgFirestore();

  const [tab, setTabState] = useState<TabId>(() => readTabFromLocation());
  const setTab = useCallback((next: TabId) => {
    setTabState(next);
    writeTabToLocation(next, { clearFocus: true });
  }, []);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusContactId, setFocusContactId] = useState<string | null>(null);
  const [focusAppointmentId, setFocusAppointmentId] = useState<string | null>(null);
  const [focusReminderId, setFocusReminderId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [googleCalendarOauthMessage, setGoogleCalendarOauthMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!seesAllOrgData && tab === "contacts") setTab("tasks");
  }, [seesAllOrgData, tab, setTab]);

  useEffect(() => {
    writeTabToLocation(tab);
  }, [tab]);

  useEffect(() => {
    const onPopState = () => setTabState(readTabFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("googleCalendar");

    if (status === "connected") {
      setGoogleCalendarOauthMessage({
        text: "Google Calendar connected. Events sync to your SimasiaAI CRM calendar.",
        error: false,
      });
      setSettingsOpen(true);
      params.delete("googleCalendar");
    } else if (status === "error") {
      const detail = params.get("message")?.trim();
      setGoogleCalendarOauthMessage({
        text: detail || "Google Calendar connection failed.",
        error: true,
      });
      setSettingsOpen(true);
      params.delete("googleCalendar");
      params.delete("message");
    }

    const deepLink = parseCrmDeepLink(params.toString());
    if (hasCrmDeepLink(deepLink)) {
      if (deepLink.taskId) {
        setTabState("tasks");
        setFocusTaskId(deepLink.taskId);
      } else if (deepLink.appointmentId) {
        setTabState("appointments");
        setFocusAppointmentId(deepLink.appointmentId);
      } else if (deepLink.reminderId) {
        setTabState("reminders");
        setFocusReminderId(deepLink.reminderId);
      } else if (deepLink.tab) {
        setTabState(deepLink.tab);
      }

      stripCrmItemParams(params);
      if (deepLink.taskId) params.set("tab", "tasks");
      else if (deepLink.appointmentId) params.set("tab", "appointments");
      else if (deepLink.reminderId) params.set("tab", "reminders");
      else if (deepLink.tab) params.set("tab", deepLink.tab);
    }

    const next = params.toString();
    const path = window.location.pathname + (next ? `?${next}` : "");
    window.history.replaceState({}, "", path);
  }, []);

  function openNotification(n: AppNotification) {
    if (n.kind === "reminder_shared" || n.kind === "reminder_due") {
      setTab("reminders");
      return;
    }
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

  function openAppointmentFromCalendar(appointmentId: string) {
    setTab("appointments");
    setFocusAppointmentId(appointmentId);
  }

  const currentUserId = currentUserPersonId || people[0]?.id || "";

  useUserAppearance(currentUserPersonId);
  const timezone = useTimezone(currentUserPersonId || "guest");

  const currentUserPerson = useMemo(
    () => people.find((p) => p.id === currentUserPersonId),
    [people, currentUserPersonId]
  );

  useNotificationAlerts(notifications, Boolean(user && currentUserPersonId));

  const currentUserName = useMemo(() => {
    if (currentUserPerson?.name.trim()) return currentUserPerson.name.trim();
    if (user?.displayName?.trim()) return user.displayName.trim();
    if (user?.email) return user.email.split("@")[0] ?? user.email;
    return "Signed in";
  }, [currentUserPerson, user]);

  const syncing = authLoading || Boolean(user && dataLoading);
  const showProfileSetup = Boolean(user && currentUserPerson && needsProfileSetup(currentUserPerson));

  useScrollRestoration(
    tab,
    Boolean(user && !authLoading && !dataLoading && !showProfileSetup)
  );

  if (!authLoading && !user) {
    return <AuthScreen />;
  }

  if (showProfileSetup && currentUserPerson) {
    return (
      <>
        <SyncingProgressBar active={syncing} />
        <ProfileSetupScreen
          person={currentUserPerson}
          onUpdatePerson={updatePerson}
          onComplete={completeProfileSetup}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen pb-12">
      <SyncingProgressBar active={syncing} />
      <header className="app-header">
        <div className="relative mx-auto flex h-11 max-w-7xl items-center justify-between gap-2 px-3 sm:h-12 sm:gap-4 sm:px-6 lg:px-8">
          <span className="relative z-10 shrink-0">
            <AppBrand />
          </span>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto">
              <TabNav active={tab} onChange={setTab} seesAllOrgData={seesAllOrgData} />
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden min-w-[3.25rem] text-right text-[10px] text-slate-400 sm:inline" aria-live="polite">
              {syncing ? "Syncing…" : ""}
            </span>
            <span
              className="max-w-[140px] truncate text-right text-[10px] text-rose-600 sm:max-w-[8rem]"
              title={error ?? undefined}
            >
              {error ?? ""}
            </span>
            <NotificationsBell
              notifications={notifications}
              onSelect={openNotification}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
            />
            <UserAccountMenu
              name={currentUserName}
              person={currentUserPerson}
              email={user?.email}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </div>
      </header>

      <main
        key={timezone.effectiveTimezone}
        className="mx-auto max-w-7xl px-4 pb-8 pt-[calc(2.75rem+1rem)] sm:px-6 sm:pt-[calc(3rem+1.25rem)] lg:px-8"
      >
        {authLoading ? null : tab === "tasks" ? (
          <TasksTab
            people={people}
            projects={projects}
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
        ) : tab === "projects" ? (
          <ProjectsTab
            projects={projects}
            tasks={tasks}
            people={people}
            currentUserId={currentUserId}
            canManageProjects={canManageProjects}
            onCreateProject={createProject}
            onUpdateProject={updateProject}
            onRemoveProject={removeProject}
            onAddTask={createTask}
            onOpenTask={openTaskFromCalendar}
          />
        ) : tab === "appointments" ? (
          <AppointmentsTab
            appointments={appointments}
            tasks={tasks}
            people={people}
            currentUserId={currentUserId}
            seesAllOrgData={seesAllOrgData}
            onCreateAppointment={createAppointment}
            onUpdateAppointment={updateAppointment}
            onCancelAppointment={cancelAppointment}
            focusAppointmentId={focusAppointmentId}
            onFocusAppointmentHandled={() => setFocusAppointmentId(null)}
          />
        ) : tab === "team" ? (
          <TeamTab
            people={people}
            currentUserId={currentUserId}
            currentUserOrgRole={currentUserOrgRole}
            onUpdatePerson={updatePerson}
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
            focusContactId={focusContactId}
            onFocusContactHandled={() => setFocusContactId(null)}
          />
        ) : tab === "reminders" ? (
          <PersonalRemindersTab
            reminders={personalReminders}
            people={people}
            contacts={contacts}
            tasks={tasks}
            appointments={appointments}
            currentUserId={currentUserId}
            onAddReminder={addPersonalReminder}
            onUpdateReminder={updatePersonalReminder}
            onRemoveReminder={removePersonalReminder}
            onOpenContact={openContactFromCalendar}
            onOpenTask={openTaskFromCalendar}
            onOpenAppointment={openAppointmentFromCalendar}
            focusReminderId={focusReminderId}
            onFocusReminderHandled={() => setFocusReminderId(null)}
          />
        ) : (
          <CalendarTab
            appointments={appointments}
            tasks={tasks}
            projects={projects}
            personalReminders={personalReminders}
            people={people}
            currentUserId={currentUserId}
            seesAllOrgData={seesAllOrgData}
            onOpenAppointment={openAppointmentFromCalendar}
            onOpenTask={openTaskFromCalendar}
            onUpdatePersonalReminder={updatePersonalReminder}
            onOpenPersonalReminder={() => setTab("reminders")}
          />
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setGoogleCalendarOauthMessage(null);
        }}
        people={people}
        seeds={registrationSeeds}
        currentUserId={currentUserPersonId}
        onCreateSeed={issueRegistrationSeed}
        canManageSeeds={canAccessSettings}
        googleCalendarOauthMessage={googleCalendarOauthMessage}
        timezone={timezone}
      />
    </div>
  );
}

export default App;
