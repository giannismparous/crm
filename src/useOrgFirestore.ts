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
  createNotificationsForTaskEvent,
  createNotificationsForTaskFinished,
  normalizeNotification,
} from "./firebase/notifications";
import { getFirebaseAuth, getFirestoreDb, SIMASIA_AI_ORG_ID } from "./firebase/config";
import { hasPrivilege, type OrgRole } from "./auth/roles";
import { ensureUserProfile } from "./firebase/ensureUserProfile";
import { normalizeContact, normalizePerson, normalizeReminder, normalizeTask } from "./firebase/normalizeFirestore";
import { createRegistrationSeed, subscribeRegistrationSeeds } from "./firebase/registrationSeeds";
import { registeredPeopleFromOrg } from "./firebase/userProfiles";
import type {
  AppNotification,
  CommentReactionNotifyChange,
  ContactReminder,
  NotificationKind,
  Person,
  PersonTaskStats,
  RegistrationSeed,
  SalesContact,
  Task,
  TaskComment,
  TaskFeedbackRequest,
} from "./types";
import { feedbackRequestsForFirestore, normalizeFeedbackRequests } from "./utils/taskFeedback";
import { NOTIFICATION_INBOX_LIMIT } from "./types";
import { sanitizeTaskUpdates } from "./utils/sanitizeRichText";
import { normalizeTaskComments } from "./utils/taskComments";
import { normalizeUpdatesByUser } from "./utils/taskUpdates";
import { recipientsForNewTask } from "./utils/notifyRecipients";
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
  const [contacts, setContacts] = useState<SalesContact[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [registrationSeeds, setRegistrationSeeds] = useState<RegistrationSeed[]>([]);

  const contactsReq = useRef(0);
  const profileSync = useRef<string | null>(null);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;

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
      setContacts([]);
      setNotifications([]);
      setRegistrationSeeds([]);
      setDataLoading(false);
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
        .catch((e) => {
          profileSync.current = null;
          const msg = e instanceof Error ? e.message : "Could not save your team profile";
          console.error("ensureUserProfile", e);
          fail(msg);
        });
    }

    const peopleCol = collection(db, "organizations", ORG, "people");
    const tasksCol = collection(db, "organizations", ORG, "tasks");
    const contactsCol = collection(db, "organizations", ORG, "contacts");

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
          if (my === contactsReq.current) fail(e instanceof Error ? e.message : String(e));
        }
      },
      (e) => fail(e.message)
    );

    return () => {
      unPeople();
      unTasks();
      unContacts();
    };
  }, [user, db]);

  const currentUserPersonId = useMemo(() => {
    if (!user) return "";
    const byUid = people.find((p) => p.authUid === user.uid || p.id === user.uid);
    if (byUid) return byUid.id;
    const byEmail = people.find((p) => p.email.toLowerCase() === user.email?.toLowerCase());
    return byEmail?.id ?? user.uid;
  }, [user, people]);

  const currentUserOrgRole = useMemo((): OrgRole => {
    const person = people.find((p) => p.id === currentUserPersonId);
    return person?.orgRole ?? "member";
  }, [people, currentUserPersonId]);

  const canAccessSettings = hasPrivilege(currentUserOrgRole, "accessSettings");

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
      const preview =
        body.trim().length > 120 ? body.trim().slice(0, 120).trimEnd() + "…" : body.trim();
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
      forWrite.comments = normalizeTaskComments(forWrite.comments);
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
    },
    [db, people, applyPersonStatDeltas]
  );

  const removeTask = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, "organizations", ORG, "tasks", id));
    },
    [db]
  );

  const addContact = useCallback(async (payload: Omit<SalesContact, "id">): Promise<string> => {
    const ref = doc(collection(db, "organizations", ORG, "contacts"));
    const id = ref.id;
    const { reminders: _r, ...rest } = payload;
    await setDoc(ref, { ...rest, id } as unknown as Record<string, unknown>);
    return id;
  }, [db]);

  const updateContact = useCallback(async (id: string, patch: Partial<SalesContact>) => {
    const { reminders: _reminders, id: _patchId, ...fields } = patch;
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
    async (contactId: string, r: Omit<ContactReminder, "id" | "done">) => {
      const ref = doc(collection(db, "organizations", ORG, "contacts", contactId, "reminders"));
      await setDoc(ref, { title: r.title, dueAt: r.dueAt, notes: r.notes, done: false });
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
      const body = scrub(rest as unknown as Record<string, unknown>);
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
    async (orgRole: OrgRole) => {
      if (!hasPrivilege(currentUserOrgRole, "issueRegistrationSeeds")) {
        throw new Error("You do not have permission to create registration seeds.");
      }
      const issuer = people.find((p) => p.id === currentUserPersonId);
      return createRegistrationSeed(db, {
        id: currentUserPersonId,
        email: issuer?.email ?? user?.email ?? "",
      }, orgRole);
    },
    [db, currentUserOrgRole, currentUserPersonId, people, user?.email]
  );

  const updatePerson = useCallback(async (id: string, patch: Partial<Person>) => {
    const {
      id: _omit,
      authUid: _auth,
      orgRole: _orgRole,
      registrationSeedId: _seed,
      registeredAt: _at,
      taskStats: _stats,
      ...fields
    } = patch;
    const ref = doc(db, "organizations", ORG, "people", id);
    const body = scrub({ ...fields, id } as unknown as Record<string, unknown>);
    if (Array.isArray(fields.departments)) {
      body.departments = [...new Set(fields.departments.map((d) => d.trim()).filter(Boolean))];
      body.department = deleteField();
    }
    if (Object.keys(body).length > 0) {
      await updateDoc(ref, body as DocumentData);
    }
  }, [db]);

  return {
    user,
    authLoading,
    dataLoading,
    error,
    people,
    tasks,
    contacts,
    notifications,
    registrationSeeds,
    currentUserPersonId,
    currentUserOrgRole,
    canAccessSettings,
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
    addContact,
    updateContact,
    removeContact,
    addReminder,
    updateReminder,
    removeReminder,
    updatePerson,
    updatePersonOrgRole,
    issueRegistrationSeed,
  };
}
