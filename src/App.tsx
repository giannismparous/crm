import { useCallback, useEffect, useMemo, useState } from "react";
import type { TabId } from "./types";
import { AppBrand } from "./components/AppBrand";
import { TabNav, TabNavMenu } from "./components/TabNav";
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
import { useChatMessageAlerts } from "./hooks/useChatMessageAlerts";
import { MessagesChatStack } from "./components/chat/MessagesChatStack";
import { useOrgFirestore } from "./useOrgFirestore";
import type { AppNotification } from "./types";
import { ActionFeedbackBanner } from "./components/ActionFeedbackBanner";
import { SyncingProgressBar } from "./components/SyncingProgressBar";
import { useUserAppearance } from "./hooks/useAppearance";
import { useTimezone } from "./hooks/useTimezone";
import { useScrollRestoration } from "./hooks/useScrollRestoration";
import { hasCrmDeepLink, parseCrmDeepLink } from "./utils/crmDeepLink";
import { readTabFromLocation, stripCrmItemParams, writeTabToLocation } from "./utils/crmUrlState";
import { PersonNavProvider } from "./contexts/PersonNavContext";
import { useT } from "./contexts/I18nContext";
import { useSyncUserLocale } from "./hooks/useSyncUserLocale";

function App() {
  const {
    user,
    authLoading,
    dataLoading,
    error,
    people,
    tasks,
    allTasks,
    projects,
    contacts,
    appointments,
    personalReminders,
    currentUserPersonId,
    currentUserOrgRole,
    updateTask,
    createTask,
    sendTaskCreatedNotifications,
    cancelTask,
    removeTask,
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
    createAppointmentSeries,
    updateAppointment,
    cancelAppointment,
    removeAppointment,
    updatePerson,
    notifications,
    markNotificationRead,
    markChatNotificationsRead,
    markAllNotificationsRead,
    notifyTaskComment,
    notifyCommentReaction,
    notifyTaskAction,
    notifyTaskFeedbackReply,
    notifyEveryoneAboutTask,
    registrationSeeds,
    canAccessSettings,
    canManageProjects,
    canAccessContacts,
    seesAllOrgData,
    issueRegistrationSeed,
    completeProfileSetup,
    profileGateLoading,
    requiresProfileSetup,
    profileSetupPerson,
    chatConversations,
    markChatConversationRead,
    chatMyMemberState,
    sendChatMessage,
    unsendChatMessage,
    openOrCreateDm,
    createGroupChat,
    chatUnreadCount,
    presenceMap,
  } = useOrgFirestore();
  const t = useT();
  useSyncUserLocale(user?.uid);

  const [tab, setTabState] = useState<TabId>(() => {
    const fromUrl = readTabFromLocation();
    return fromUrl === "messages" ? "tasks" : fromUrl;
  });
  const [chatOpenRequest, setChatOpenRequest] = useState<string | null>(null);
  const setTab = useCallback((next: TabId) => {
    setTabState(next);
    writeTabToLocation(next, { clearFocus: true });
  }, []);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusContactId, setFocusContactId] = useState<string | null>(null);
  const [focusAppointmentId, setFocusAppointmentId] = useState<string | null>(null);
  const [focusReminderId, setFocusReminderId] = useState<string | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [googleCalendarOauthMessage, setGoogleCalendarOauthMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!canAccessContacts && tab === "contacts") setTab("tasks");
  }, [canAccessContacts, tab, setTab]);

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
        text: t("app.googleCalendar.connected"),
        error: false,
      });
      setSettingsOpen(true);
      params.delete("googleCalendar");
    } else if (status === "error") {
      const detail = params.get("message")?.trim();
      setGoogleCalendarOauthMessage({
        text: detail || t("app.googleCalendar.failed"),
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
      } else if (deepLink.contactId) {
        setTabState("contacts");
        setFocusContactId(deepLink.contactId);
      } else if (deepLink.tab) {
        setTabState(deepLink.tab);
      }

      stripCrmItemParams(params);
      if (deepLink.taskId) params.set("tab", "tasks");
      else if (deepLink.appointmentId) params.set("tab", "appointments");
      else if (deepLink.reminderId) params.set("tab", "reminders");
      else if (deepLink.contactId) params.set("tab", "contacts");
      else if (deepLink.tab) params.set("tab", deepLink.tab);
    }

    const next = params.toString();
    const path = window.location.pathname + (next ? `?${next}` : "");
    window.history.replaceState({}, "", path);
  }, []);

  function openNotification(n: AppNotification) {
    if (n.kind === "chat_message" && n.conversationId) {
      setChatOpenRequest(n.conversationId);
      void markChatConversationRead(n.conversationId);
      return;
    }
    if (n.kind === "reminder_shared" || n.kind === "reminder_due") {
      setTab("reminders");
      return;
    }
    if (n.kind === "member_joined" && n.taskId) {
      openTeamMember(n.taskId);
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

  const openTeamMember = useCallback(
    (personId: string) => {
      const id = personId.trim();
      if (!id) return;
      setFocusPersonId(id);
      setTab("team");
    },
    [setTab]
  );

  const currentUserId = currentUserPersonId || people[0]?.id || "";

  useUserAppearance(currentUserPersonId);
  const timezone = useTimezone(currentUserPersonId || "guest");

  const currentUserPerson = useMemo(
    () => people.find((p) => p.id === currentUserPersonId),
    [people, currentUserPersonId]
  );

  const bellNotifications = useMemo(
    () => notifications.filter((n) => n.kind !== "chat_message"),
    [notifications]
  );

  useNotificationAlerts(bellNotifications, Boolean(user && currentUserPersonId));
  useChatMessageAlerts(notifications, Boolean(user && currentUserPersonId));

  const currentUserName = useMemo(() => {
    if (currentUserPerson?.name.trim()) return currentUserPerson.name.trim();
    if (user?.displayName?.trim()) return user.displayName.trim();
    if (user?.email) return user.email.split("@")[0] ?? user.email;
    return t("app.signedIn");
  }, [currentUserPerson, user, t]);

  const syncing = authLoading || profileGateLoading || Boolean(user && dataLoading && !requiresProfileSetup);

  const appContentReady = Boolean(
    user && !authLoading && !profileGateLoading && !requiresProfileSetup && !dataLoading
  );

  useScrollRestoration(
    tab,
    Boolean(user && !authLoading && !dataLoading && !profileGateLoading && !requiresProfileSetup)
  );

  if (authLoading && !user) {
    return <SyncingProgressBar active />;
  }

  if (!authLoading && !user) {
    return <AuthScreen />;
  }

  if (requiresProfileSetup && profileSetupPerson) {
    return (
      <>
        <SyncingProgressBar active={syncing} />
        <ProfileSetupScreen
          key={profileSetupPerson.id}
          person={profileSetupPerson}
          onUpdatePerson={updatePerson}
          onComplete={completeProfileSetup}
        />
      </>
    );
  }

  const headerActions = (
    <>
      <span className="hidden text-right text-[10px] text-slate-400 md:inline" aria-live="polite">
        {syncing ? t("common.syncing") : ""}
      </span>
      <span
        className="hidden max-w-[10rem] truncate text-right text-[10px] text-rose-600 md:inline lg:max-w-[12rem]"
        title={error ?? undefined}
      >
        {error && !syncing ? error : ""}
      </span>
      <NotificationsBell
        notifications={bellNotifications}
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
    </>
  );

  return (
    <PersonNavProvider onOpenTeamMember={openTeamMember}>
    <div className="min-h-screen pb-12">
      <SyncingProgressBar active={syncing} />
      <header className="app-header">
        <div className="mx-auto grid h-11 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-3 sm:h-12 sm:gap-6 sm:px-6 lg:gap-8 lg:px-8">
          <span className="shrink-0">
            <AppBrand />
          </span>
          <div className="flex min-w-0 justify-center">
            <div className="xl:hidden">
              <TabNavMenu active={tab} onChange={setTab} showContactsTab={canAccessContacts} />
            </div>
            <div className="nav-scroll hidden min-w-0 max-w-full xl:block">
              <TabNav active={tab} onChange={setTab} showContactsTab={canAccessContacts} />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-self-end gap-1 sm:gap-2">{headerActions}</div>
        </div>
      </header>

      <main
        key={timezone.effectiveTimezone}
        className="mx-auto max-w-7xl px-4 pb-8 pt-[calc(2.75rem+1rem)] sm:px-6 sm:pt-[calc(3rem+1.25rem)] lg:px-8"
      >
        {appContentReady ? (
          tab === "tasks" ? (
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
            allTasks={allTasks}
            projects={projects}
            people={people}
            currentUserId={currentUserId}
            seesAllOrgData={seesAllOrgData}
            onCreateAppointment={createAppointment}
            onCreateAppointmentSeries={createAppointmentSeries}
            onUpdateAppointment={updateAppointment}
            onCancelAppointment={cancelAppointment}
            onRemoveAppointment={removeAppointment}
            onCreateTask={createTask}
            onSendTaskCreatedNotifications={sendTaskCreatedNotifications}
            onUpdateTask={updateTask}
            onRemoveTask={removeTask}
            onOpenTask={openTaskFromCalendar}
            focusAppointmentId={focusAppointmentId}
            onFocusAppointmentHandled={() => setFocusAppointmentId(null)}
          />
        ) : tab === "team" ? (
          <TeamTab
            people={people}
            currentUserId={currentUserId}
            currentUserOrgRole={currentUserOrgRole}
            onUpdatePerson={updatePerson}
            focusPersonId={focusPersonId}
            onFocusPersonHandled={() => setFocusPersonId(null)}
            presenceMap={presenceMap}
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
        )
        ) : null}
      </main>

      <MessagesChatStack
        unreadCount={chatUnreadCount}
        people={people}
        currentUserId={currentUserId}
        currentUserOrgRole={currentUserOrgRole}
        conversations={chatConversations}
        myMemberState={chatMyMemberState}
        presenceMap={presenceMap}
        onSendMessage={sendChatMessage}
        onUnsendMessage={unsendChatMessage}
        onOpenOrCreateDm={openOrCreateDm}
        onCreateGroup={createGroupChat}
        onMarkRead={markChatConversationRead}
        onMarkChatNotificationsRead={markChatNotificationsRead}
        openConversationRequest={chatOpenRequest}
        onOpenConversationRequestHandled={() => setChatOpenRequest(null)}
      />

      <ActionFeedbackBanner />

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
    </PersonNavProvider>
  );
}

export default App;
