import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import {
  createNotificationsForComment,
  createNotificationsForCommentReaction,
  deleteNotificationsForCommentReaction,
  createNotificationsForReminderShared,
  createNotificationsForNewMember,
  createNotificationsForTaskEvent,
  createNotificationsForTaskFinished,
  normalizeNotification,
} from "./firebase/notifications";
import { getFirebaseAuth, getFirestoreDb, SIMASIA_AI_ORG_ID } from "./firebase/config";
import { syncCrmItemToGoogleCalendar } from "./firebase/googleCalendar";
import { canSeeAllOrgData, hasPrivilege, type OrgRole } from "./auth/roles";
import { ensureUserProfile } from "./firebase/ensureUserProfile";
import {
  normalizeAppointment,
  normalizeContact,
  normalizePerson,
  normalizePersonalReminder,
  normalizeProject,
  normalizeReminder,
  normalizeTask,
} from "./firebase/normalizeFirestore";
import { createRegistrationSeed, subscribeRegistrationSeeds } from "./firebase/registrationSeeds";
import { registeredPeopleFromOrg } from "./firebase/userProfiles";
import { normalizeAssigneeDepartments } from "./utils/taskAssignees";
import {
  appointmentVisibleToViewer,
  personVisibleToViewer,
  projectVisibleToViewer,
  reminderVisibleToViewer,
  taskVisibleToViewer,
} from "./utils/orgVisibility";
import type {
  AppNotification,
  Appointment,
  CommentReactionNotifyChange,
  ContactReminder,
  ImageAttachment,
  NotificationKind,
  PersonalReminder,
  Person,
  PersonTaskStats,
  Project,
  CreateRegistrationSeedInput,
  RegistrationSeed,
  SalesContact,
  Task,
  TaskComment,
  TaskFeedbackRequest,
} from "./types";
import { feedbackRequestsForFirestore, normalizeFeedbackRequests } from "./utils/taskFeedback";
import { NOTIFICATION_INBOX_LIMIT } from "./types";
import { richTextHasContent } from "./utils/richTextImages";
import { normalizeContactIdentity } from "./utils/contactMerge";
import { sanitizeTaskUpdates, taskUpdatesToPlainText } from "./utils/sanitizeRichText";
import { normalizeTaskComments, taskCommentsForFirestore } from "./utils/taskComments";
import { imageAttachmentsForFirestore } from "./utils/imageAttachments";
import { normalizeUpdatesByUser } from "./utils/taskUpdates";
import { recipientIdsFromSelection, recipientsForNewTask } from "./utils/notifyRecipients";
import {
  isPersonalReminderRelevantToPerson,
  personalReminderLinkFieldsForWrite,
  resolvePersonalReminderLinks,
} from "./utils/personalReminderLinks";
import { tryFireReminderDueNotifications } from "./utils/reminderDueNotifications";
import {
  computePersonStatDeltas,
  isTaskCompleted,
  statDeltaForNewTask,
  type TaskUpdateIntent,
} from "./utils/personTaskStats";

const PERSON_TASK_STAT_KEYS: (keyof PersonTaskStats)[] = [
  "tasksCompleted",
  "tasksFinishedMarked",
  "feedbackRequested",
  "feedbackGiven",
  "tasksAssigned",
  "tasksPostponed",
];

const ORG = SIMASIA_AI_ORG_ID;

function scrub<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Firestore rejects `undefined` at any depth in update payloads. */
function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => stripUndefinedDeep(item));
  if (typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }
  return value;
}

export function useOrgFirestore() {
  const db = getFirestoreDb();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peopleRaw, setPeopleRaw] = useState<Person[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<SalesContact[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [personalReminders, setPersonalReminders] = useState<PersonalReminder[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [registrationSeeds, setRegistrationSeeds] = useState<RegistrationSeed[]>([]);

  const contactsReq = useRef(0);
  const profileSync = useRef<string | null>(null);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;
  const appointmentsRef = useRef<Appointment[]>([]);
  appointmentsRef.current = appointments;

  /** Linked to Firebase Auth (`authUid`) — excludes legacy seed rows. */
  const people = useMemo(() => registeredPeopleFromOrg(peopleRaw), [peopleRaw]);

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setPeopleRaw([]);
      setTasks([]);
      setProjects([]);
      setContacts([]);
      setAppointments([]);
      setNotifications([]);
      setRegistrationSeeds([]);
      // Keep dataLoading true while auth is still resolving so the sync bar doesn't restart.
      if (!authLoading) setDataLoading(false);
      setError(null);
      profileSync.current = null;
      return;
    }

    setDataLoading(true);
    setError(null);

    const fail = (msg: string) => {
      setError(msg);
      setDataLoading(false);
    };

    if (profileSync.current !== user.uid) {
      void ensureUserProfile(user)
        .then(() => {
          profileSync.current = user.uid;
        })
        .catch(async (e) => {
          profileSync.current = null;
          const msg = e instanceof Error ? e.message : "Could not verify your team account";
          console.error("ensureUserProfile", e);
          try {
            const { signOutUser } = await import("./firebase/config");
            await signOutUser();
          } catch (signOutErr) {
            console.error("signOut after profile failure", signOutErr);
          }
          fail(msg);
        });
    }

    const peopleCol = collection(db, "organizations", ORG, "people");
    const tasksCol = collection(db, "organizations", ORG, "tasks");
    const projectsCol = collection(db, "organizations", ORG, "projects");
    const appointmentsCol = collection(db, "organizations", ORG, "appointments");
    const personalRemindersCol = collection(db, "organizations", ORG, "personalReminders");

    const unPeople = onSnapshot(
      peopleCol,
      (snap) => {
        const list = snap.docs.map((d) => normalizePerson(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setPeopleRaw(list);
      },
      (e) => fail(e.message)
    );

    const unTasks = onSnapshot(
      tasksCol,
      (snap) => {
        const list = snap.docs.map((d) => normalizeTask(d.id, d.data() as Record<string, unknown>));
        setTasks(list);
        setDataLoading(false);
      },
      (e) => fail(e.message)
    );

    const unProjects = onSnapshot(
      projectsCol,
      (snap) => {
        const list = snap.docs.map((d) => normalizeProject(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setProjects(list);
      },
      (e) => fail(e.message)
    );

    const unAppointments = onSnapshot(
      appointmentsCol,
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizeAppointment(d.id, d.data() as Record<string, unknown>)
        );
        list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        setAppointments(list);
      },
      (e) => fail(e.message)
    );

    const unPersonalReminders = onSnapshot(
      personalRemindersCol,
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizePersonalReminder(d.id, d.data() as Record<string, unknown>)
        );
        list.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
        setPersonalReminders(list);
      },
      (e) => fail(e.message)
    );

    return () => {
      unPeople();
      unTasks();
      unProjects();
      unAppointments();
      unPersonalReminders();
    };
  }, [user, authLoading, db]);

  const currentUserPersonId = useMemo(() => {
    if (!user) return "";
    const byUid = people.find((p) => p.authUid === user.uid || p.id === user.uid);
    if (byUid) return byUid.id;
    const byEmail = people.find((p) => p.email.toLowerCase() === user.email?.toLowerCase());
    return byEmail?.id ?? user.uid;
  }, [user, people]);

  const currentUserOrgRole = useMemo((): OrgRole => {
    const person = people.find((p) => p.id === currentUserPersonId);
    return person?.orgRole ?? "partner";
  }, [people, currentUserPersonId]);

  const currentUserPerson = useMemo(
    () => people.find((p) => p.id === currentUserPersonId),
    [people, currentUserPersonId]
  );

  const seesAllOrgData = canSeeAllOrgData(currentUserOrgRole);
  const canAccessSettings = hasPrivilege(currentUserOrgRole, "accessSettings");
  const canManageProjects = hasPrivilege(currentUserOrgRole, "manageProjects");

  const visiblePeople = useMemo(() => {
    if (seesAllOrgData) return people;
    return people.filter((p) => personVisibleToViewer(p, currentUserPerson, currentUserOrgRole));
  }, [people, currentUserPerson, currentUserOrgRole, seesAllOrgData]);

  const visibleProjects = useMemo(() => {
    if (seesAllOrgData) return projects;
    return projects.filter((p) => projectVisibleToViewer(p, currentUserPerson, currentUserOrgRole));
  }, [projects, currentUserPerson, currentUserOrgRole, seesAllOrgData]);

  const visibleTasks = useMemo(() => {
    if (seesAllOrgData) return tasks;
    return tasks.filter((t) =>
      taskVisibleToViewer(t, currentUserPerson, currentUserPersonId, people, projects, currentUserOrgRole)
    );
  }, [tasks, people, projects, currentUserPerson, currentUserPersonId, currentUserOrgRole, seesAllOrgData]);

  const visibleAppointments = useMemo(() => {
    if (seesAllOrgData) return appointments;
    return appointments.filter((a) =>
      appointmentVisibleToViewer(a, currentUserPersonId, people, currentUserOrgRole)
    );
  }, [appointments, people, currentUserPersonId, currentUserOrgRole, seesAllOrgData]);

  const visiblePersonalReminders = useMemo(() => {
    if (seesAllOrgData) return personalReminders;
    return personalReminders.filter((r) =>
      reminderVisibleToViewer(r, currentUserPersonId, people, currentUserOrgRole)
    );
  }, [personalReminders, people, currentUserPersonId, currentUserOrgRole, seesAllOrgData]);

  const visibleContacts = seesAllOrgData ? contacts : [];

  useEffect(() => {
    if (!user || !seesAllOrgData) {
      setContacts([]);
      return;
    }

    const contactsCol = collection(db, "organizations", ORG, "contacts");
    const unContacts = onSnapshot(
      contactsCol,
      async (snap) => {
        const my = ++contactsReq.current;
        try {
          const list = await Promise.all(
            snap.docs.map(async (d) => {
              const remSnap = await getDocs(collection(db, "organizations", ORG, "contacts", d.id, "reminders"));
              const reminders = remSnap.docs.map((r) =>
                normalizeReminder(r.id, r.data() as Record<string, unknown>)
              );
              reminders.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
              return normalizeContact(d.id, d.data() as Record<string, unknown>, reminders);
            })
          );
          if (my !== contactsReq.current) return;
          list.sort((a, b) => a.lastName.localeCompare(b.lastName));
          setContacts(list);
        } catch (e) {
          if (my === contactsReq.current) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }
      },
      (e) => setError(e.message)
    );

    return () => unContacts();
  }, [user, seesAllOrgData, db]);

  useEffect(() => {
    if (!user || !currentUserPersonId) {
      setNotifications([]);
      return;
    }
    const q = query(
      collection(db, "organizations", ORG, "notifications"),
      where("recipientId", "==", currentUserPersonId),
      orderBy("createdAt", "desc"),
      limit(NOTIFICATION_INBOX_LIMIT)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizeNotification(d.id, d.data() as Record<string, unknown>)
        );
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setNotifications(list);
      },
      (e) => {
        console.error("notifications", e);
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("permission") || msg.includes("Permission")) {
          const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
          setError(
            `Notifications blocked by Firestore rules. Publish firestore.rules${projectId ? ` to project ${projectId}` : ""} (see README or run: npx firebase deploy --only firestore:rules).`
          );
        }
      }
    );
    return () => unsub();
  }, [user, currentUserPersonId, db]);

  const reminderDueProcessingRef = useRef(false);

  useEffect(() => {
    if (!user || !currentUserPersonId || personalReminders.length === 0) return;

    let cancelled = false;

    async function runDueReminderChecks() {
      if (reminderDueProcessingRef.current) return;
      reminderDueProcessingRef.current = true;
      try {
        const relevant = personalReminders.filter((r) =>
          isPersonalReminderRelevantToPerson(r, currentUserPersonId, people)
        );
        for (const reminder of relevant) {
          if (cancelled) break;
          await tryFireReminderDueNotifications(db, ORG, reminder, people);
        }
      } catch (e) {
        console.error("reminderDueNotifications", e);
      } finally {
        reminderDueProcessingRef.current = false;
      }
    }

    void runDueReminderChecks();
    const intervalId = window.setInterval(() => void runDueReminderChecks(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user, currentUserPersonId, personalReminders, people, db]);

  useEffect(() => {
    if (!user || !canAccessSettings) {
      setRegistrationSeeds([]);
      return;
    }
    const unsub = subscribeRegistrationSeeds(db, setRegistrationSeeds, (msg) => {
      console.error("registrationSeeds", msg);
    });
    return () => unsub();
  }, [user, canAccessSettings, db]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      const ref = doc(db, "organizations", ORG, "notifications", notificationId);
      await updateDoc(ref, { read: true });
    },
    [db]
  );

  const markAllNotificationsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    for (const n of unread) {
      batch.update(doc(db, "organizations", ORG, "notifications", n.id), { read: true });
    }
    await batch.commit();
  }, [db, notifications]);

  const notifyEveryoneAboutTask = useCallback(
    async (task: Task, kind: NotificationKind, preview: string) => {
      const actor = people.find((p) => p.id === currentUserPersonId);
      const actorName = actor?.name ?? user?.email?.split("@")[0] ?? "Someone";
      const recipientIds = people.map((p) => p.id).filter((id) => id && id !== currentUserPersonId);
      if (recipientIds.length === 0) return;
      try {
        await createNotificationsForTaskEvent(
          db,
          ORG,
          task,
          currentUserPersonId,
          actorName,
          recipientIds,
          kind,
          preview
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send notifications";
        console.error("notifyEveryoneAboutTask", e);
        setError(msg);
      }
    },
    [db, people, currentUserPersonId, user]
  );

  const notifyTaskComment = useCallback(
    async (task: Task, comment: TaskComment) => {
      try {
        await createNotificationsForComment(db, ORG, task, comment, people);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send notifications";
        console.error("notifyTaskComment", e);
        setError(msg);
      }
    },
    [db, people]
  );

  const notifyCommentReaction = useCallback(
    async (task: Task, comment: TaskComment, change: CommentReactionNotifyChange) => {
      const actor = people.find((p) => p.id === currentUserPersonId);
      const actorName = actor?.name ?? user?.email?.split("@")[0] ?? "Someone";
      try {
        if (change.kind === "cleared") {
          await deleteNotificationsForCommentReaction(
            db,
            ORG,
            comment,
            currentUserPersonId,
            people
          );
        } else {
          await createNotificationsForCommentReaction(
            db,
            ORG,
            task,
            comment,
            currentUserPersonId,
            actorName,
            change.vote,
            people
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send notifications";
        console.error("notifyCommentReaction", e);
        setError(msg);
      }
    },
    [db, people, currentUserPersonId, user]
  );

  const notifyTaskAction = useCallback(
    async (
      task: Task,
      recipientIds: string[],
      kind: NotificationKind,
      preview: string
    ) => {
      const actor = people.find((p) => p.id === currentUserPersonId);
      const actorName = actor?.name ?? user?.email?.split("@")[0] ?? "Someone";
      try {
        if (kind === "task_finished") {
          await createNotificationsForTaskFinished(
            db,
            ORG,
            task,
            currentUserPersonId,
            actorName,
            people
          );
        } else {
          await createNotificationsForTaskEvent(
            db,
            ORG,
            task,
            currentUserPersonId,
            actorName,
            recipientIds,
            kind,
            preview
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not send notifications";
        console.error("notifyTaskAction", e);
        setError(msg);
      }
    },
    [db, people, currentUserPersonId, user]
  );

  const notifyTaskFeedbackReply = useCallback(
    async (task: Task, request: TaskFeedbackRequest, body: string) => {
      const requesterId = request.requestedById;
      if (!requesterId || requesterId === currentUserPersonId) return;
      const actor = people.find((p) => p.id === currentUserPersonId);
      const actorName = actor?.name ?? user?.email?.split("@")[0] ?? "Someone";
      const plain = taskUpdatesToPlainText(sanitizeTaskUpdates(body));
      const preview =
        plain.length > 120 ? plain.slice(0, 120).trimEnd() + "…" : plain;
      try {
        await createNotificationsForTaskEvent(
          db,
          ORG,
          task,
          currentUserPersonId,
          actorName,
          [requesterId],
          "task_feedback_reply",
          `${actorName}: ${preview}`
        );
      } catch (e) {
        console.error("notifyTaskFeedbackReply", e);
      }
    },
    [db, people, currentUserPersonId, user]
  );

  const applyPersonStatDeltas = useCallback(
    async (deltas: Map<string, Partial<PersonTaskStats>>) => {
      if (deltas.size === 0) return;
      const batch = writeBatch(db);
      for (const [personId, changes] of deltas) {
        const inc: Record<string, ReturnType<typeof increment>> = {};
        for (const key of PERSON_TASK_STAT_KEYS) {
          const delta = changes[key];
          if (typeof delta === "number" && delta !== 0) {
            inc[`taskStats.${key}`] = increment(delta);
          }
        }
        if (Object.keys(inc).length > 0) {
          batch.update(doc(db, "organizations", ORG, "people", personId), inc);
        }
      }
      await batch.commit();
    },
    [db]
  );

  function mergeTaskPatch(before: Task, patch: Partial<Task>): Task {
    return { ...before, ...patch };
  }

  const updateTask = useCallback(
    async (
      id: string,
      patch: Partial<Task>,
      options?: { intent?: TaskUpdateIntent; actorId?: string }
    ) => {
    const before = tasksRef.current.find((t) => t.id === id);
    const ref = doc(db, "organizations", ORG, "tasks", id);
    const { id: _omitId, ...rest } = patch as Partial<Task> & { id?: string };
    const forWrite = { ...rest } as Record<string, unknown>;

    if (before) {
      const wasDone = isTaskCompleted(before);
      if (patch.status === "done" && !wasDone) {
        forWrite.completedAt = new Date().toISOString();
      }
      if (wasDone && patch.status != null && patch.status !== "done") {
        forWrite.completedAt = deleteField();
      }
    }
    if (Array.isArray(forWrite.assigneeIds)) {
      const ids = [...new Set((forWrite.assigneeIds as string[]).filter(Boolean))];
      forWrite.assigneeIds = ids;
      forWrite.assigneeId = ids[0] ?? "";
    }
    if (Array.isArray(forWrite.assigneeDepartmentIds)) {
      forWrite.assigneeDepartmentIds = [...new Set((forWrite.assigneeDepartmentIds as string[]).filter(Boolean))];
    }
    if (Array.isArray(forWrite.finishedByIds)) {
      forWrite.finishedByIds = [...new Set((forWrite.finishedByIds as string[]).filter(Boolean))];
    }
    if (Array.isArray(forWrite.feedbackByIds)) {
      forWrite.feedbackByIds = [...new Set((forWrite.feedbackByIds as string[]).filter(Boolean))];
    }
    if (Array.isArray(forWrite.feedbackRequests)) {
      const normalized = normalizeFeedbackRequests(forWrite.feedbackRequests);
      forWrite.feedbackRequests = feedbackRequestsForFirestore(normalized);
    }
    if (typeof forWrite.updates === "string") {
      forWrite.updates = sanitizeTaskUpdates(forWrite.updates);
    }
    if (Array.isArray(forWrite.comments)) {
      const normalized = normalizeTaskComments(forWrite.comments);
      forWrite.comments = taskCommentsForFirestore(normalized);
    }
    if (forWrite.updatesByUser != null) {
      const byUser = normalizeUpdatesByUser(forWrite.updatesByUser);
      if (Object.keys(byUser).length === 0) {
        delete forWrite.updatesByUser;
        forWrite.updatesByUser = deleteField();
      } else {
        forWrite.updatesByUser = byUser;
      }
    }
    if (patch.projectId === "") {
      forWrite.projectId = deleteField();
    }
    await updateDoc(
      ref,
      scrub(stripUndefinedDeep(forWrite) as Record<string, unknown>) as DocumentData
    );

    if (before) {
      const after = mergeTaskPatch(before, patch);
      try {
        const deltas = computePersonStatDeltas(before, after, people, options);
        await applyPersonStatDeltas(deltas);
      } catch (e) {
        console.error("applyPersonStatDeltas", e);
      }
    }

    void syncCrmItemToGoogleCalendar("task", id);
  },
    [db, people, applyPersonStatDeltas]
  );

  const cancelTask = useCallback(
    async (id: string, canceledById: string) => {
      const now = new Date().toISOString();
      await updateTask(
        id,
        { status: "canceled", canceledAt: now, canceledById },
        { actorId: canceledById }
      );
    },
    [updateTask]
  );

  const createTask = useCallback(
    async (payload: Omit<Task, "id" | "createdAt">) => {
      const ref = doc(collection(db, "organizations", ORG, "tasks"));
      const id = ref.id;
      const assigneeIds = [...new Set((payload.assigneeIds ?? []).filter(Boolean))];
      const assigneeDepartmentIds = [...new Set((payload.assigneeDepartmentIds ?? []).filter(Boolean))];
      const row: Task = {
        ...payload,
        assigneeIds,
        assigneeDepartmentIds,
        finishedByIds: payload.finishedByIds ?? [],
        feedbackByIds: payload.feedbackByIds ?? [],
        feedbackRequests: payload.feedbackRequests ?? [],
        updates: sanitizeTaskUpdates(payload.updates ?? ""),
        updatesByUser: normalizeUpdatesByUser(payload.updatesByUser),
        comments: normalizeTaskComments(payload.comments),
        id,
        createdAt: new Date().toISOString(),
      };
      const feedbackRequests = feedbackRequestsForFirestore(normalizeFeedbackRequests(row.feedbackRequests));
      await setDoc(
        ref,
        scrub(
          stripUndefinedDeep({
            ...(row as unknown as Record<string, unknown>),
            assigneeId: assigneeIds[0] ?? "",
            feedbackRequests,
          }) as Record<string, unknown>
        ) as Record<string, unknown>
      );

      const creatorId = payload.assignedById || "";
      const notifyIds = recipientsForNewTask(row, people, creatorId);
      if (notifyIds.length > 0 && creatorId) {
        const actor = people.find((p) => p.id === creatorId);
        const actorName = actor?.name ?? "Someone";
        try {
          await createNotificationsForTaskEvent(
            db,
            ORG,
            row,
            creatorId,
            actorName,
            notifyIds,
            "task_created",
            `${actorName} created “${row.title.trim() || "Untitled task"}”.`
          );
        } catch (e) {
          console.error("createTask notifications", e);
        }
      }

      await applyPersonStatDeltas(statDeltaForNewTask(creatorId));
      void syncCrmItemToGoogleCalendar("task", id);
    },
    [db, people, applyPersonStatDeltas]
  );

  const removeTask = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, "organizations", ORG, "tasks", id));
      void syncCrmItemToGoogleCalendar("task", id, "delete");
    },
    [db]
  );

  const createProject = useCallback(
    async (payload: Omit<Project, "id" | "createdAt" | "completed" | "completedAt">) => {
      if (!hasPrivilege(currentUserOrgRole, "manageProjects")) {
        throw new Error("You do not have permission to create projects.");
      }
      const departmentIds = normalizeAssigneeDepartments(payload.departmentIds ?? []);
      const ref = doc(collection(db, "organizations", ORG, "projects"));
      const row: Project = {
        id: ref.id,
        name: payload.name.trim(),
        description: payload.description.trim(),
        color: payload.color,
        completed: false,
        createdAt: new Date().toISOString(),
        ...(departmentIds.length > 0 ? { departmentIds } : {}),
      };
      await setDoc(ref, scrub(row as unknown as Record<string, unknown>));
    },
    [db, currentUserOrgRole]
  );

  const updateProject = useCallback(
    async (id: string, patch: Partial<Project>) => {
      if (!hasPrivilege(currentUserOrgRole, "manageProjects")) {
        throw new Error("You do not have permission to edit projects.");
      }
      const { id: _omit, createdAt: _at, ...fields } = patch;
      const body = scrub(fields as Record<string, unknown>);
      if (typeof body.name === "string") body.name = body.name.trim();
      if (typeof body.description === "string") body.description = body.description.trim();
      if (patch.departmentIds !== undefined) {
        const departmentIds = normalizeAssigneeDepartments(patch.departmentIds);
        if (departmentIds.length > 0) body.departmentIds = departmentIds;
        else body.departmentIds = deleteField();
      }
      if (patch.completed === true && patch.completedAt === undefined) {
        body.completedAt = new Date().toISOString();
      }
      if (patch.completed === false) {
        body.completedAt = deleteField();
      }
      if (Object.keys(body).length > 0) {
        await updateDoc(doc(db, "organizations", ORG, "projects", id), body as DocumentData);
      }
    },
    [db, currentUserOrgRole]
  );

  const removeProject = useCallback(
    async (id: string) => {
      if (!hasPrivilege(currentUserOrgRole, "manageProjects")) {
        throw new Error("You do not have permission to delete projects.");
      }
      const batch = writeBatch(db);
      for (const t of tasksRef.current) {
        if (t.projectId === id) {
          batch.update(doc(db, "organizations", ORG, "tasks", t.id), { projectId: deleteField() });
        }
      }
      batch.delete(doc(db, "organizations", ORG, "projects", id));
      await batch.commit();
    },
    [db, currentUserOrgRole]
  );

  const addContact = useCallback(
    async (payload: Omit<SalesContact, "id">, contactId?: string): Promise<string> => {
      const identity = normalizeContactIdentity({
        firstName: payload.firstName,
        lastName: payload.lastName,
        company: payload.company,
      });
      if (!identity) {
        throw new Error("First name, last name, or company is required");
      }
      const ref = contactId
        ? doc(db, "organizations", ORG, "contacts", contactId)
        : doc(collection(db, "organizations", ORG, "contacts"));
      const id = ref.id;
      const { reminders: _r, lastContactedAt, firstName: _fn, lastName: _ln, company: _co, ...rest } = payload;
      const generalNotes =
        typeof rest.generalNotes === "string" ? sanitizeTaskUpdates(rest.generalNotes) : rest.generalNotes;
      const body: Record<string, unknown> = {
        ...rest,
        firstName: identity.firstName,
        lastName: identity.lastName,
        company: identity.company,
        generalNotes,
        id,
      };
      if (lastContactedAt?.trim()) body.lastContactedAt = lastContactedAt;
      await setDoc(ref, body);
      return id;
    },
    [db]
  );

  const updateContact = useCallback(async (id: string, patch: Partial<SalesContact>) => {
    const { reminders: _reminders, id: _patchId, ...fields } = patch;
    if (typeof fields.generalNotes === "string") {
      fields.generalNotes = sanitizeTaskUpdates(fields.generalNotes);
    }
    if ("lastContactedAt" in fields && !String(fields.lastContactedAt ?? "").trim()) {
      fields.lastContactedAt = deleteField() as unknown as string;
    }
    const ref = doc(db, "organizations", ORG, "contacts", id);
    const body = scrub({ ...fields, id } as unknown as Record<string, unknown>);
    if (Object.keys(body).length === 0) return;
    await updateDoc(ref, body as DocumentData);
  }, [db]);

  const removeContact = useCallback(
    async (id: string) => {
      const remSnap = await getDocs(collection(db, "organizations", ORG, "contacts", id, "reminders"));
      const batch = writeBatch(db);
      remSnap.docs.forEach((r) => batch.delete(r.ref));
      batch.delete(doc(db, "organizations", ORG, "contacts", id));
      await batch.commit();
    },
    [db]
  );

  const refreshContactReminders = useCallback(
    async (contactId: string) => {
      const remSnap = await getDocs(collection(db, "organizations", ORG, "contacts", contactId, "reminders"));
      const reminders = remSnap.docs.map((r) =>
        normalizeReminder(r.id, r.data() as Record<string, unknown>)
      );
      reminders.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, reminders } : c)));
    },
    [db]
  );

  const addReminder = useCallback(
    async (contactId: string, r: Omit<ContactReminder, "id" | "done">, reminderId?: string) => {
      const ref = reminderId
        ? doc(db, "organizations", ORG, "contacts", contactId, "reminders", reminderId)
        : doc(collection(db, "organizations", ORG, "contacts", contactId, "reminders"));
      const row: Record<string, unknown> = {
        title: r.title,
        dueAt: r.dueAt,
        notes: r.notes,
        done: false,
      };
      if (r.attachments?.length) {
        row.attachments = imageAttachmentsForFirestore(r.attachments);
      }
      await setDoc(ref, scrub(row));
      await refreshContactReminders(contactId);
    },
    [db, refreshContactReminders]
  );

  const patchContactReminderLocal = useCallback(
    (contactId: string, reminderId: string, patch: Partial<ContactReminder>) => {
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id !== contactId) return c;
          return {
            ...c,
            reminders: c.reminders.map((r) => (r.id === reminderId ? { ...r, ...patch } : r)),
          };
        })
      );
    },
    []
  );

  const updateReminder = useCallback(
    async (contactId: string, reminderId: string, patch: Partial<ContactReminder>) => {
      patchContactReminderLocal(contactId, reminderId, patch);
      const ref = doc(db, "organizations", ORG, "contacts", contactId, "reminders", reminderId);
      const { id: _omit, ...rest } = patch as Partial<ContactReminder> & { id?: string };
      const forWrite = { ...rest } as Record<string, unknown>;
      if (Array.isArray(forWrite.attachments)) {
        forWrite.attachments =
          forWrite.attachments.length > 0
            ? imageAttachmentsForFirestore(forWrite.attachments as ImageAttachment[])
            : deleteField();
      }
      const body = scrub(forWrite as unknown as Record<string, unknown>);
      if (Object.keys(body).length > 0) {
        await updateDoc(ref, body as DocumentData);
      }
      await refreshContactReminders(contactId);
    },
    [db, patchContactReminderLocal, refreshContactReminders]
  );

  const removeReminder = useCallback(
    async (contactId: string, reminderId: string) => {
      await deleteDoc(doc(db, "organizations", ORG, "contacts", contactId, "reminders", reminderId));
      await refreshContactReminders(contactId);
    },
    [db, refreshContactReminders]
  );

  const updatePersonOrgRole = useCallback(
    async (personId: string, orgRole: OrgRole) => {
      if (!hasPrivilege(currentUserOrgRole, "manageOrgRoles")) {
        throw new Error("You do not have permission to change roles.");
      }
      const ref = doc(db, "organizations", ORG, "people", personId);
      await updateDoc(ref, { orgRole, id: personId });
    },
    [db, currentUserOrgRole]
  );

  const issueRegistrationSeed = useCallback(
    async (input: CreateRegistrationSeedInput) => {
      if (!hasPrivilege(currentUserOrgRole, "issueRegistrationSeeds")) {
        throw new Error("You do not have permission to create registration seeds.");
      }
      const issuer = people.find((p) => p.id === currentUserPersonId);
      return createRegistrationSeed(db, {
        id: currentUserPersonId,
        email: issuer?.email ?? user?.email ?? "",
      }, input);
    },
    [db, currentUserOrgRole, currentUserPersonId, people, user?.email]
  );

  const completeProfileSetup = useCallback(
    async (patch: { name: string; title: string }) => {
      if (!currentUserPersonId) throw new Error("Not signed in.");
      const name = patch.name.trim();
      if (!name) throw new Error("Enter your display name.");
      const person = peopleRaw.find((p) => p.id === currentUserPersonId);
      const ref = doc(db, "organizations", ORG, "people", currentUserPersonId);
      await updateDoc(ref, {
        id: currentUserPersonId,
        name,
        title: patch.title.trim(),
        profileSetupComplete: true,
      });
      await updateDoc(doc(db, "users", currentUserPersonId), {
        displayName: name,
        updatedAt: new Date().toISOString(),
      });
      try {
        await createNotificationsForNewMember(
          db,
          ORG,
          currentUserPersonId,
          name,
          person?.orgRole ?? "partner",
          person?.departments ?? [],
          registeredPeopleFromOrg(peopleRaw)
        );
      } catch (e) {
        console.error("createNotificationsForNewMember", e);
      }
    },
    [db, currentUserPersonId, peopleRaw]
  );

  const createAppointment = useCallback(
    async (payload: Omit<Appointment, "id" | "createdAt" | "status">, appointmentId?: string) => {
      const ref = appointmentId
        ? doc(db, "organizations", ORG, "appointments", appointmentId)
        : doc(collection(db, "organizations", ORG, "appointments"));
      const id = ref.id;
      const participantIds = [...new Set((payload.participantIds ?? []).filter(Boolean))];
      const participantDepartmentIds = [
        ...new Set((payload.participantDepartmentIds ?? []).filter(Boolean)),
      ];
      const { description: rawDescription, ...payloadRest } = payload;
      const description =
        typeof rawDescription === "string" ? sanitizeTaskUpdates(rawDescription) : undefined;
      const row: Appointment = {
        ...payloadRest,
        participantIds,
        participantDepartmentIds,
        id,
        status: "scheduled",
        createdAt: new Date().toISOString(),
        ...(description && richTextHasContent(description) ? { description } : {}),
      };
      const forWrite = stripUndefinedDeep({
        ...(row as unknown as Record<string, unknown>),
        ...(row.attachments?.length
          ? { attachments: imageAttachmentsForFirestore(row.attachments) }
          : {}),
      }) as Record<string, unknown>;
      await setDoc(ref, scrub(forWrite) as Record<string, unknown>);
      void syncCrmItemToGoogleCalendar("appointment", id);
      return id;
    },
    [db]
  );

  const updateAppointment = useCallback(
    async (id: string, patch: Partial<Appointment>) => {
      const ref = doc(db, "organizations", ORG, "appointments", id);
      const { id: _omitId, ...rest } = patch as Partial<Appointment> & { id?: string };
      const forWrite = { ...rest } as Record<string, unknown>;
      if (Array.isArray(forWrite.participantIds)) {
        forWrite.participantIds = [...new Set((forWrite.participantIds as string[]).filter(Boolean))];
      }
      if (Array.isArray(forWrite.participantDepartmentIds)) {
        forWrite.participantDepartmentIds = [
          ...new Set((forWrite.participantDepartmentIds as string[]).filter(Boolean)),
        ];
      }
      if ("description" in forWrite) {
        const safe = sanitizeTaskUpdates(String(forWrite.description ?? ""));
        if (richTextHasContent(safe)) forWrite.description = safe;
        else forWrite.description = deleteField();
      }
      if ("meetingLink" in forWrite && !String(forWrite.meetingLink ?? "").trim()) {
        forWrite.meetingLink = deleteField();
      }
      if ("endsAt" in forWrite && !String(forWrite.endsAt ?? "").trim()) {
        forWrite.endsAt = deleteField();
      }
      if ("taskId" in forWrite && !String(forWrite.taskId ?? "").trim()) {
        forWrite.taskId = deleteField();
      }
      if (Array.isArray(forWrite.attachments)) {
        forWrite.attachments =
          forWrite.attachments.length > 0
            ? imageAttachmentsForFirestore(forWrite.attachments as ImageAttachment[])
            : deleteField();
      }
      const body = scrub(stripUndefinedDeep(forWrite) as Record<string, unknown>) as Record<string, unknown>;
      if (Object.keys(body).length === 0) return;
      await updateDoc(ref, body as DocumentData);
      void syncCrmItemToGoogleCalendar("appointment", id);

      if ("taskId" in patch) {
        const linked = personalReminders.filter((r) => r.appointmentId === id);
        if (linked.length > 0) {
          const taskId = String(patch.taskId ?? "").trim();
          await Promise.all(
            linked.map((r) => {
              const prRef = doc(db, "organizations", ORG, "personalReminders", r.id);
              return updateDoc(
                prRef,
                taskId ? { taskId } : ({ taskId: deleteField() } as DocumentData)
              );
            })
          );
        }
      }
    },
    [db, personalReminders]
  );

  const addPersonalReminder = useCallback(
    async (
      payload: Omit<PersonalReminder, "id" | "createdAt" | "done">,
      reminderId?: string
    ): Promise<string> => {
      const ref = reminderId
        ? doc(db, "organizations", ORG, "personalReminders", reminderId)
        : doc(collection(db, "organizations", ORG, "personalReminders"));
      const id = ref.id;
      const linked = resolvePersonalReminderLinks(payload, appointmentsRef.current);
      const participantIds = [...new Set((linked.participantIds ?? payload.participantIds ?? []).filter(Boolean))];
      const participantDepartmentIds = [
        ...new Set((linked.participantDepartmentIds ?? payload.participantDepartmentIds ?? []).filter(Boolean)),
      ];
      const row: Record<string, unknown> = {
        id,
        ownerId: linked.ownerId ?? payload.ownerId,
        title: linked.title ?? payload.title,
        dueAt: linked.dueAt ?? payload.dueAt,
        notes: linked.notes ?? payload.notes,
        done: false,
        createdAt: new Date().toISOString(),
        participantIds,
        participantDepartmentIds,
      };
      for (const [k, v] of Object.entries(personalReminderLinkFieldsForWrite(linked))) {
        if (v) row[k] = v;
      }
      if (payload.attachments?.length) {
        row.attachments = imageAttachmentsForFirestore(payload.attachments);
      }
      await setDoc(ref, scrub(row));
      const ownerId = String(linked.ownerId ?? payload.ownerId);
      const notifyIds = recipientIdsFromSelection(
        people,
        participantIds,
        participantDepartmentIds,
        [ownerId]
      );
      if (notifyIds.length > 0) {
        const actor = people.find((p) => p.id === ownerId);
        try {
          await createNotificationsForReminderShared(
            db,
            ORG,
            id,
            String(linked.title ?? payload.title),
            ownerId,
            actor?.name?.trim() || actor?.email?.trim() || "Someone",
            notifyIds,
            String(linked.notes ?? payload.notes ?? "")
          );
        } catch (e) {
          console.error("notifyReminderShared", e);
        }
      }
      void syncCrmItemToGoogleCalendar("personalReminder", id);
      return id;
    },
    [db, people]
  );

  const updatePersonalReminder = useCallback(
    async (id: string, patch: Partial<PersonalReminder>) => {
      const existing = personalReminders.find((r) => r.id === id);
      const merged = existing ? { ...existing, ...patch } : patch;
      const linked = resolvePersonalReminderLinks(merged, appointmentsRef.current);
      const ref = doc(db, "organizations", ORG, "personalReminders", id);
      const { id: _omit, createdAt: _ca, ownerId: _oid, ...rest } = linked as PersonalReminder;
      const forWrite = { ...rest } as Record<string, unknown>;
      Object.assign(forWrite, personalReminderLinkFieldsForWrite(linked));
      if (Array.isArray(forWrite.participantIds)) {
        forWrite.participantIds = [...new Set((forWrite.participantIds as string[]).filter(Boolean))];
      }
      if (Array.isArray(forWrite.participantDepartmentIds)) {
        forWrite.participantDepartmentIds = [
          ...new Set((forWrite.participantDepartmentIds as string[]).filter(Boolean)),
        ];
      }
      if (Array.isArray(forWrite.attachments)) {
        forWrite.attachments =
          forWrite.attachments.length > 0
            ? imageAttachmentsForFirestore(forWrite.attachments as ImageAttachment[])
            : deleteField();
      }
      if (existing && patch.dueAt !== undefined) {
        const nextDue = String(linked.dueAt ?? patch.dueAt).trim();
        if (nextDue && nextDue !== existing.dueAt) {
          forWrite.dueNotifyFired = [];
        }
      }
      const body = scrub(stripUndefinedDeep(forWrite) as Record<string, unknown>);
      if (Object.keys(body).length === 0) return;
      setPersonalReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...linked, id } as PersonalReminder : r))
      );
      await updateDoc(ref, body as DocumentData);
      void syncCrmItemToGoogleCalendar("personalReminder", id);

      if (existing) {
        const ownerId = existing.ownerId;
        const prevIds = new Set(
          recipientIdsFromSelection(
            people,
            existing.participantIds,
            existing.participantDepartmentIds,
            [ownerId]
          )
        );
        const nextIds = recipientIdsFromSelection(
          people,
          (linked.participantIds as string[] | undefined) ?? existing.participantIds,
          (linked.participantDepartmentIds as string[] | undefined) ?? existing.participantDepartmentIds,
          [ownerId]
        );
        const added = nextIds.filter((rid) => !prevIds.has(rid));
        if (added.length > 0) {
          const actor = people.find((p) => p.id === currentUserPersonId);
          try {
            await createNotificationsForReminderShared(
              db,
              ORG,
              id,
              String(linked.title ?? existing.title),
              currentUserPersonId,
              actor?.name?.trim() || actor?.email?.trim() || "Someone",
              added,
              String(linked.notes ?? existing.notes ?? "")
            );
          } catch (e) {
            console.error("notifyReminderShared", e);
          }
        }
      }
    },
    [db, personalReminders, people, currentUserPersonId]
  );

  const removePersonalReminder = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, "organizations", ORG, "personalReminders", id));
      void syncCrmItemToGoogleCalendar("personalReminder", id, "delete");
    },
    [db]
  );

  const cancelAppointment = useCallback(
    async (id: string) => {
      await updateAppointment(id, {
        status: "canceled",
        canceledAt: new Date().toISOString(),
      });
    },
    [updateAppointment]
  );

  const removeAppointment = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, "organizations", ORG, "appointments", id));
      void syncCrmItemToGoogleCalendar("appointment", id, "delete");
    },
    [db]
  );

  const updatePerson = useCallback(
    async (id: string, patch: Partial<Person>) => {
      const touchesAvatar =
        patch.avatarUrl !== undefined || patch.avatarStoragePath !== undefined;
      if (touchesAvatar && id !== currentUserPersonId) {
        throw new Error("Only you can change your profile photo.");
      }

      const {
        id: _omit,
        authUid: _auth,
        orgRole: _orgRole,
        registrationSeedId: _seed,
        registeredAt: _at,
        taskStats: _stats,
        profileSetupComplete: _setup,
        ...fields
      } = patch;

      if (
        fields.departments !== undefined &&
        id === currentUserPersonId &&
        !hasPrivilege(currentUserOrgRole, "manageOrgRoles")
      ) {
        delete fields.departments;
      }
      const ref = doc(db, "organizations", ORG, "people", id);
      const body = scrub({ ...fields, id } as unknown as Record<string, unknown>);
      if (Array.isArray(fields.departments)) {
        body.departments = [...new Set(fields.departments.map((d) => d.trim()).filter(Boolean))];
        body.department = deleteField();
      }
      if (fields.avatarUrl === "") body.avatarUrl = deleteField();
      if (fields.avatarStoragePath === "") body.avatarStoragePath = deleteField();
      if (Object.keys(body).length > 0) {
        await updateDoc(ref, body as DocumentData);
      }
    },
    [db, currentUserPersonId, currentUserOrgRole]
  );

  return {
    user,
    authLoading,
    dataLoading,
    error,
    people: visiblePeople,
    tasks: visibleTasks,
    projects: visibleProjects,
    contacts: visibleContacts,
    appointments: visibleAppointments,
    personalReminders: visiblePersonalReminders,
    notifications,
    registrationSeeds,
    currentUserPersonId,
    currentUserOrgRole,
    canAccessSettings,
    canManageProjects,
    seesAllOrgData,
    markNotificationRead,
    markAllNotificationsRead,
    notifyEveryoneAboutTask,
    notifyTaskComment,
    notifyCommentReaction,
    notifyTaskAction,
    notifyTaskFeedbackReply,
    updateTask,
    createTask,
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
    createAppointment,
    updateAppointment,
    cancelAppointment,
    removeAppointment,
    addPersonalReminder,
    updatePersonalReminder,
    removePersonalReminder,
    updatePerson,
    updatePersonOrgRole,
    issueRegistrationSeed,
    completeProfileSetup,
  };
}
