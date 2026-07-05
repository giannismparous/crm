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
  partnerAppointmentQueries,
  partnerPersonalReminderQueries,
  partnerProjectQueries,
  partnerTaskQueries,
  subscribeMergedQueries,
} from "./firebase/scopedOrgListeners";
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
import { canSeeAllOrgData, hasPrivilege, normalizeOrgRole, type OrgRole } from "./auth/roles";
import { ensureUserProfile } from "./firebase/ensureUserProfile";
import { isRegistrationInProgress } from "./firebase/registerWithSeed";
import { clearProfileSetupPending, consumeUserProfileSynchronized } from "./firebase/profileSync";
import { needsProfileSetup } from "./utils/profileSetup";
import {
  normalizeAppointment,
  normalizeContact,
  normalizePerson,
  normalizePersonalReminder,
  normalizeProject,
  normalizeReminder,
  normalizeResearchItem,
  normalizeTask,
} from "./firebase/normalizeFirestore";
import { createRegistrationSeed, subscribeRegistrationSeeds } from "./firebase/registrationSeeds";
import { registeredPeopleFromOrg } from "./firebase/userProfiles";
import { normalizeAssigneeDepartments } from "./utils/taskAssignees";
import {
  appointmentVisibleToViewer,
  canAccessContacts,
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
  ResearchItem,
  SalesContact,
  Task,
  TaskComment,
  TaskFeedbackRequest,
} from "./types";
import { feedbackRequestsForFirestore, normalizeFeedbackRequests } from "./utils/taskFeedback";
import { NOTIFICATION_INBOX_LIMIT } from "./types";
import { loadLocale } from "./i18n/localeStorage";
import { translate } from "./i18n/translate";
import { richTextHasContent } from "./utils/richTextImages";
import { normalizeContactIdentity, trimContactTextFields } from "./utils/contactMerge";
import { sanitizeTaskUpdates, taskUpdatesToPlainText } from "./utils/sanitizeRichText";
import { normalizeTaskComments, taskCommentsForFirestore } from "./utils/taskComments";
import { normalizeTaskUpdateEntries, taskUpdateEntriesForFirestore } from "./utils/taskUpdateEntries";
import { deleteImagesFromStorage, imageAttachmentsForFirestore } from "./utils/imageAttachments";
import {
  normalizeRecurrenceCount,
  normalizeRecurrenceRule,
} from "./utils/appointmentRecurrence";
import { isRecurringAppointment, expandAppointmentOccurrences } from "./utils/appointmentDisplay";
import { isOccurrencePast, type AppointmentCancelScope } from "./utils/appointmentOccurrence";
import {
  expandTaskOccurrences,
  isRecurringTask,
  taskAnchorIso,
  type TaskCancelScope,
} from "./utils/taskDisplay";
import { normalizeOccurrenceFieldsMap } from "./utils/appointmentOccurrenceFields";
import { tryFireAppointmentRsvpNotifications } from "./utils/appointmentRsvpNotifications";
import { isAppointmentRelevantToPerson } from "./utils/appointments";
import {
  storagePathsFromAppointment,
  storagePathsFromContact,
  storagePathsFromContactReminder,
  storagePathsFromPersonalReminder,
  storagePathsFromResearchItem,
  storagePathsFromTask,
} from "./utils/entityStoragePaths";
import { normalizeUpdatesByUser } from "./utils/taskUpdates";
import { recipientIdsFromSelection, recipientsForNewTask } from "./utils/notifyRecipients";
import {
  isPersonalReminderRelevantToPerson,
  personalReminderLinkFieldsForWrite,
  resolvePersonalReminderLinks,
} from "./utils/personalReminderLinks";
import { tryFireReminderDueNotifications } from "./utils/reminderDueNotifications";
import { ensureFoundersChat } from "./firebase/chat";
import {
  computePersonStatDeltas,
  isTaskCompleted,
  statDeltaForNewTask,
  type TaskUpdateIntent,
} from "./utils/personTaskStats";
import {
  applyFirestoreListIfChanged,
  commitFirestoreDocList,
  personFirestoreListVersion,
} from "./utils/firestoreListSync";

const PERSON_TASK_STAT_KEYS: (keyof PersonTaskStats)[] = [
  "tasksCompleted",
  "tasksFinishedMarked",
  "feedbackRequested",
  "feedbackGiven",
  "tasksAssigned",
  "tasksPostponed",
];

const ORG = SIMASIA_AI_ORG_ID;
/** Defer background notification scans so initial Firestore listeners get bandwidth first. */
const BACKGROUND_SYNC_DEFER_MS = 15_000;

export type UseOrgFirestoreOptions = {
  /** When true, subscribe to contacts (+ per-contact reminder fetches). Default: defer until Contacts tab. */
  loadContacts?: boolean;
  /** When true, subscribe to research items. Default: defer until Research tab. */
  loadResearch?: boolean;
};

function scrub<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function taskListVersion(t: Task): string {
  return [
    t.status,
    t.dueDate,
    t.completedAt ?? "",
    t.comments.length,
    t.updateEntries.length,
    t.finishedByIds.join(","),
    t.title,
  ].join("|");
}

function projectListVersion(p: Project): string {
  return [p.name, p.completed, p.color, (p.departmentIds ?? []).join(",")].join("|");
}

function appointmentListVersion(a: Appointment): string {
  return [a.status, a.startsAt, a.title, a.projectId ?? ""].join("|");
}

function personalReminderListVersion(r: PersonalReminder): string {
  return [r.done, r.dueAt, r.title, (r.dueNotifyFired ?? []).join(",")].join("|");
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

export function useOrgFirestore(options: UseOrgFirestoreOptions = {}) {
  const loadContacts = options.loadContacts ?? false;
  const loadResearch = options.loadResearch ?? false;
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
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [registrationSeeds, setRegistrationSeeds] = useState<RegistrationSeed[]>([]);
  const [accessProfile, setAccessProfile] = useState<{
    orgRole: OrgRole;
    departments: string[];
    ready: boolean;
  } | null>(null);
  const [selfPersonDoc, setSelfPersonDoc] = useState<{ loaded: boolean; person: Person | null }>({
    loaded: false,
    person: null,
  });

  const contactsReq = useRef(0);
  const profileSync = useRef<string | null>(null);
  /** Avoid restarting the sync bar when listeners re-subscribe for the same user (e.g. StrictMode). */
  const dataReadyForUser = useRef<string | null>(null);
  const accessProfileRef = useRef<{
    orgRole: OrgRole;
    departments: string[];
    ready: boolean;
  } | null>(null);
  const peopleListFp = useRef("");
  const tasksListFp = useRef("");
  const projectsListFp = useRef("");
  const appointmentsListFp = useRef("");
  const personalRemindersListFp = useRef("");
  const initialPeopleSnapshotRef = useRef(false);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;
  const appointmentsRef = useRef<Appointment[]>([]);
  appointmentsRef.current = appointments;
  const contactsRef = useRef<SalesContact[]>([]);
  contactsRef.current = contacts;
  const personalRemindersRef = useRef<PersonalReminder[]>([]);
  personalRemindersRef.current = personalReminders;
  const researchItemsRef = useRef<ResearchItem[]>([]);
  researchItemsRef.current = researchItems;

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
      setAccessProfile(null);
      setSelfPersonDoc({ loaded: false, person: null });
      return;
    }

    let orgRole: OrgRole = "partner";
    let departments: string[] = [];
    let roleReady = false;
    let deptsReady = false;

    const maybeSetProfile = () => {
      if (!roleReady || !deptsReady) return;
      const deptsKey = departments.join("\0");
      const prev = accessProfileRef.current;
      if (prev?.ready && prev.orgRole === orgRole && prev.departments.join("\0") === deptsKey) return;
      const next = { orgRole, departments: [...departments], ready: true as const };
      accessProfileRef.current = next;
      setAccessProfile(next);
    };

    const unUser = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        orgRole = normalizeOrgRole(snap.data()?.orgRole);
        roleReady = true;
        maybeSetProfile();
      },
      () => {
        orgRole = "partner";
        roleReady = true;
        maybeSetProfile();
      }
    );

    const unPerson = onSnapshot(
      doc(db, "organizations", ORG, "people", user.uid),
      (snap) => {
        const person = snap.exists()
          ? normalizePerson(snap.id, snap.data() as Record<string, unknown>)
          : null;
        setSelfPersonDoc({ loaded: true, person });
        if (person && person.profileSetupComplete !== false) {
          clearProfileSetupPending(user.uid);
        }
        const raw = snap.data()?.departments;
        departments = Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
        deptsReady = true;
        maybeSetProfile();
      },
      () => {
        setSelfPersonDoc({ loaded: true, person: null });
        departments = [];
        deptsReady = true;
        maybeSetProfile();
      }
    );

    return () => {
      unUser();
      unPerson();
      accessProfileRef.current = null;
      setAccessProfile(null);
      setSelfPersonDoc({ loaded: false, person: null });
    };
  }, [user, db]);

  const accessOrgRole = accessProfile?.ready ? accessProfile.orgRole : null;
  const accessDepartmentsKey = accessProfile?.ready ? accessProfile.departments.join("\0") : "";

  useEffect(() => {
    if (!user) {
      setPeopleRaw([]);
      setTasks([]);
      setProjects([]);
      setContacts([]);
      setAppointments([]);
      setPersonalReminders([]);
      setNotifications([]);
      setRegistrationSeeds([]);
      dataReadyForUser.current = null;
      peopleListFp.current = "";
      tasksListFp.current = "";
      projectsListFp.current = "";
      appointmentsListFp.current = "";
      personalRemindersListFp.current = "";
      initialPeopleSnapshotRef.current = false;
      accessProfileRef.current = null;
      // Keep dataLoading true while auth is still resolving so the sync bar doesn't restart.
      if (!authLoading) setDataLoading(false);
      setError(null);
      profileSync.current = null;
      return;
    }

    if (!accessOrgRole) return;

    const accessSnapshot = accessProfileRef.current;
    if (!accessSnapshot?.ready) return;

    const needsInitialLoad = dataReadyForUser.current !== user.uid;
    if (needsInitialLoad) {
      setDataLoading(true);
      initialPeopleSnapshotRef.current = false;
    }
    setError(null);

    const fail = (msg: string) => {
      if (/permission/i.test(msg)) {
        console.error("org data sync (permission)", msg);
        setError(translate(loadLocale(), "sync.permissionError"));
        markDataReady();
        return;
      }
      setError(msg);
      dataReadyForUser.current = user.uid;
      setDataLoading(false);
    };

    const markDataReady = () => {
      dataReadyForUser.current = user.uid;
      setDataLoading(false);
    };

    const notePeopleLoaded = () => {
      if (initialPeopleSnapshotRef.current) return;
      initialPeopleSnapshotRef.current = true;
      markDataReady();
    };

    if (profileSync.current !== user.uid) {
      if (consumeUserProfileSynchronized(user.uid)) {
        profileSync.current = user.uid;
      } else if (!isRegistrationInProgress()) {
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
    }

    const seesAll = canSeeAllOrgData(accessSnapshot.orgRole);
    const uid = user.uid;
    const departments = accessSnapshot.departments;

    const peopleCol = collection(db, "organizations", ORG, "people");
    const tasksCol = collection(db, "organizations", ORG, "tasks");
    const projectsCol = collection(db, "organizations", ORG, "projects");
    const appointmentsCol = collection(db, "organizations", ORG, "appointments");
    const personalRemindersCol = collection(db, "organizations", ORG, "personalReminders");

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        peopleCol,
        (snap) => {
          commitFirestoreDocList(
            peopleListFp,
            snap.docs,
            (id, data) => normalizePerson(id, data),
            setPeopleRaw,
            {
              sort: (a, b) => a.name.localeCompare(b.name),
              docVersion: personFirestoreListVersion,
            }
          );
          notePeopleLoaded();
        },
        (e) => fail(e.message)
      )
    );

    let unPartnerTasks: (() => void) | null = null;
    let partnerProjectIdsKey = "";

    const attachPartnerTasks = (projectIds: string[]) => {
      unPartnerTasks?.();
      unPartnerTasks = subscribeMergedQueries(
        partnerTaskQueries(db, ORG, uid, departments, projectIds),
        {
          normalize: (id, data) => normalizeTask(id, data),
          onData: (list) => {
            applyFirestoreListIfChanged(tasksListFp, list, taskListVersion, setTasks);
          },
          onError: fail,
        }
      );
    };

    if (seesAll) {
      unsubs.push(
        onSnapshot(
          tasksCol,
          (snap) => {
            commitFirestoreDocList(
              tasksListFp,
              snap.docs,
              (id, data) => normalizeTask(id, data),
              setTasks
            );
          },
          (e) => fail(e.message)
        )
      );
    } else {
      attachPartnerTasks([]);
    }

    if (seesAll) {
      unsubs.push(
        onSnapshot(
          projectsCol,
          (snap) => {
            commitFirestoreDocList(
              projectsListFp,
              snap.docs,
              (id, data) => normalizeProject(id, data),
              setProjects,
              { sort: (a, b) => a.name.localeCompare(b.name) }
            );
          },
          (e) => fail(e.message)
        )
      );
    } else {
      unsubs.push(
        subscribeMergedQueries(
          partnerProjectQueries(db, ORG, departments),
          {
            normalize: (id, data) => normalizeProject(id, data),
            onData: (list) => {
              list.sort((a, b) => a.name.localeCompare(b.name));
              const idsKey = list
                .map((p) => p.id)
                .sort()
                .join(",");
              if (idsKey !== partnerProjectIdsKey) {
                partnerProjectIdsKey = idsKey;
                attachPartnerTasks(list.map((p) => p.id));
              }
              applyFirestoreListIfChanged(projectsListFp, list, projectListVersion, setProjects);
            },
            onError: fail,
          }
        )
      );
    }

    if (seesAll) {
      unsubs.push(
        onSnapshot(
          appointmentsCol,
          (snap) => {
            commitFirestoreDocList(
              appointmentsListFp,
              snap.docs,
              (id, data) => normalizeAppointment(id, data),
              setAppointments,
              { sort: (a, b) => a.startsAt.localeCompare(b.startsAt) }
            );
          },
          (e) => fail(e.message)
        )
      );
    } else {
      unsubs.push(
        subscribeMergedQueries(
          partnerAppointmentQueries(db, ORG, uid, departments),
          {
            normalize: (id, data) => normalizeAppointment(id, data),
            onData: (list) => {
              list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              applyFirestoreListIfChanged(appointmentsListFp, list, appointmentListVersion, setAppointments);
            },
            onError: fail,
          }
        )
      );
    }

    if (seesAll) {
      unsubs.push(
        onSnapshot(
          personalRemindersCol,
          (snap) => {
            commitFirestoreDocList(
              personalRemindersListFp,
              snap.docs,
              (id, data) => normalizePersonalReminder(id, data),
              setPersonalReminders,
              { sort: (a, b) => a.dueAt.localeCompare(b.dueAt) }
            );
          },
          (e) => fail(e.message)
        )
      );
    } else {
      unsubs.push(
        subscribeMergedQueries(
          partnerPersonalReminderQueries(db, ORG, uid, departments),
          {
            normalize: (id, data) => normalizePersonalReminder(id, data),
            onData: (list) => {
              list.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
              applyFirestoreListIfChanged(
                personalRemindersListFp,
                list,
                personalReminderListVersion,
                setPersonalReminders
              );
            },
            onError: fail,
          }
        )
      );
    }

    return () => {
      unPartnerTasks?.();
      for (const unsub of unsubs) unsub();
    };
  }, [user, authLoading, db, accessOrgRole, accessDepartmentsKey]);

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

  const starredTaskIds = useMemo(
    () => new Set(currentUserPerson?.starredTaskIds ?? []),
    [currentUserPerson?.starredTaskIds]
  );

  const profileSetupPerson = useMemo(() => {
    if (!user) return null;
    const fromPeople = people.find((p) => p.id === user.uid || p.authUid === user.uid);
    return fromPeople ?? selfPersonDoc.person;
  }, [user, people, selfPersonDoc.person]);

  const profileGateLoading = Boolean(
    user && (!selfPersonDoc.loaded || isRegistrationInProgress())
  );

  const requiresProfileSetup = Boolean(
    user && selfPersonDoc.loaded && profileSetupPerson && needsProfileSetup(profileSetupPerson)
  );

  const seesAllOrgData = canSeeAllOrgData(currentUserOrgRole);
  const canAccessSettings = hasPrivilege(currentUserOrgRole, "accessSettings");
  const canManageProjects = hasPrivilege(currentUserOrgRole, "manageProjects");
  const canAccessResearch = hasPrivilege(currentUserOrgRole, "accessResearch");
  const canAccessStrategicPlan = hasPrivilege(currentUserOrgRole, "accessStrategicPlan");
  const canSeeContacts = canAccessContacts(currentUserPerson, currentUserOrgRole);

  const visiblePeople = people;

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

  const visibleContacts = canSeeContacts ? contacts : [];
  const visibleResearchItems = canAccessResearch ? researchItems : [];

  useEffect(() => {
    if (!user || !canSeeContacts || !loadContacts) {
      setContacts([]);
      return;
    }

    const contactsCol = collection(db, "organizations", ORG, "contacts");
    const unContacts = onSnapshot(
      contactsCol,
      async (snap) => {
        const prevById = new Map(contactsRef.current.map((c) => [c.id, c]));

        const list = snap.docs.map((d) => {
          const prev = prevById.get(d.id);
          return normalizeContact(
            d.id,
            d.data() as Record<string, unknown>,
            prev?.reminders ?? []
          );
        });
        list.sort((a, b) => a.lastName.localeCompare(b.lastName));
        setContacts(list);

        const needsReminders = snap.docs.filter((d) => !prevById.has(d.id)).map((d) => d.id);
        if (needsReminders.length === 0) return;

        const my = ++contactsReq.current;
        try {
          const reminderByContact = new Map<string, ContactReminder[]>();
          await Promise.all(
            needsReminders.map(async (contactId) => {
              const remSnap = await getDocs(
                collection(db, "organizations", ORG, "contacts", contactId, "reminders")
              );
              const reminders = remSnap.docs
                .map((r) => normalizeReminder(r.id, r.data() as Record<string, unknown>))
                .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
              reminderByContact.set(contactId, reminders);
            })
          );
          if (my !== contactsReq.current) return;
          setContacts((prev) => {
            const next = prev.map((c) => {
              const reminders = reminderByContact.get(c.id);
              return reminders ? { ...c, reminders } : c;
            });
            next.sort((a, b) => a.lastName.localeCompare(b.lastName));
            return next;
          });
        } catch (e) {
          if (my === contactsReq.current) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }
      },
      (e) => setError(e.message)
    );

    return () => unContacts();
  }, [user, canSeeContacts, loadContacts, db]);

  useEffect(() => {
    if (!user || !canAccessResearch || !loadResearch) {
      setResearchItems([]);
      return;
    }

    const researchCol = collection(db, "organizations", ORG, "research");
    const unResearch = onSnapshot(
      researchCol,
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizeResearchItem(d.id, d.data() as Record<string, unknown>)
        );
        list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setResearchItems(list);
      },
      (e) => setError(e.message)
    );

    return () => unResearch();
  }, [user, canAccessResearch, loadResearch, db]);

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
        list.sort((a, b) => {
          const pinA = a.kind === "appointment_rsvp" && !a.read;
          const pinB = b.kind === "appointment_rsvp" && !b.read;
          if (pinA !== pinB) return pinA ? -1 : 1;
          return b.createdAt.localeCompare(a.createdAt);
        });
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
  const personalRemindersLiveRef = useRef(personalReminders);
  personalRemindersLiveRef.current = personalReminders;
  const peopleLiveRef = useRef(people);
  peopleLiveRef.current = people;

  useEffect(() => {
    if (!user || !currentUserPersonId) return;

    let cancelled = false;

    async function runDueReminderChecks() {
      if (reminderDueProcessingRef.current) return;
      const personalRemindersNow = personalRemindersLiveRef.current;
      const peopleNow = peopleLiveRef.current;
      if (personalRemindersNow.length === 0) return;
      reminderDueProcessingRef.current = true;
      try {
        const relevant = personalRemindersNow.filter((r) =>
          isPersonalReminderRelevantToPerson(r, currentUserPersonId, peopleNow)
        );
        for (const reminder of relevant) {
          if (cancelled) break;
          await tryFireReminderDueNotifications(db, ORG, reminder, peopleNow);
        }
      } catch (e) {
        console.error("reminderDueNotifications", e);
      } finally {
        reminderDueProcessingRef.current = false;
      }
    }

    const deferId = window.setTimeout(() => void runDueReminderChecks(), BACKGROUND_SYNC_DEFER_MS);
    const intervalId = window.setInterval(() => void runDueReminderChecks(), 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(deferId);
      window.clearInterval(intervalId);
    };
  }, [user, currentUserPersonId, db]);

  const appointmentRsvpProcessingRef = useRef(false);
  const appointmentsLiveRef = useRef(appointments);
  appointmentsLiveRef.current = appointments;

  useEffect(() => {
    if (!user || !currentUserPersonId) return;

    let cancelled = false;

    async function runAppointmentRsvpChecks() {
      if (appointmentRsvpProcessingRef.current) return;
      const appointmentsNow = appointmentsLiveRef.current;
      const peopleNow = peopleLiveRef.current;
      if (appointmentsNow.length === 0) return;
      appointmentRsvpProcessingRef.current = true;
      try {
        const relevant = appointmentsNow.filter((a) =>
          isAppointmentRelevantToPerson(a, currentUserPersonId, peopleNow)
        );
        for (const apt of relevant) {
          if (cancelled) break;
          await tryFireAppointmentRsvpNotifications(db, ORG, apt, peopleNow);
        }
      } catch (e) {
        console.error("appointmentRsvpNotifications", e);
      } finally {
        appointmentRsvpProcessingRef.current = false;
      }
    }

    const deferId = window.setTimeout(() => void runAppointmentRsvpChecks(), BACKGROUND_SYNC_DEFER_MS);
    const intervalId = window.setInterval(() => void runAppointmentRsvpChecks(), 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(deferId);
      window.clearInterval(intervalId);
    };
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

  const markChatNotificationsRead = useCallback(
    async (conversationId: string) => {
      const id = conversationId.trim();
      if (!id) return;
      const unread = notifications.filter(
        (n) => n.kind === "chat_message" && !n.read && n.conversationId === id
      );
      if (unread.length === 0) return;
      const batch = writeBatch(db);
      for (const n of unread) {
        batch.update(doc(db, "organizations", ORG, "notifications", n.id), { read: true });
      }
      await batch.commit();
    },
    [db, notifications]
  );

  const markAllNotificationsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read && n.kind !== "chat_message");
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
      const actorName =
        actor?.name ?? user?.email?.split("@")[0] ?? translate(loadLocale(), "common.someone");
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
        const msg = e instanceof Error ? e.message : translate(loadLocale(), "notifications.error.send");
        console.error("notifyEveryoneAboutTask", e);
        setError(msg);
      }
    },
    [db, people, currentUserPersonId, user]
  );

  const notifyTaskComment = useCallback(
    async (task: Task, comment: TaskComment) => {
      try {
        await createNotificationsForComment(db, ORG, task, comment, people, projects);
      } catch (e) {
        const msg = e instanceof Error ? e.message : translate(loadLocale(), "notifications.error.send");
        console.error("notifyTaskComment", e);
        setError(msg);
      }
    },
    [db, people, projects]
  );

  const notifyCommentReaction = useCallback(
    async (task: Task, comment: TaskComment, change: CommentReactionNotifyChange) => {
      const actor = people.find((p) => p.id === currentUserPersonId);
      const actorName =
        actor?.name ?? user?.email?.split("@")[0] ?? translate(loadLocale(), "common.someone");
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
        const msg = e instanceof Error ? e.message : translate(loadLocale(), "notifications.error.send");
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
      const actorName =
        actor?.name ?? user?.email?.split("@")[0] ?? translate(loadLocale(), "common.someone");
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
        const msg = e instanceof Error ? e.message : translate(loadLocale(), "notifications.error.send");
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
      const actorName =
        actor?.name ?? user?.email?.split("@")[0] ?? translate(loadLocale(), "common.someone");
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
      options?: { intent?: TaskUpdateIntent; actorId?: string; skipCalendarSync?: boolean }
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
    if (typeof forWrite.description === "string") {
      forWrite.description = sanitizeTaskUpdates(forWrite.description);
    }
    if (Array.isArray(forWrite.comments)) {
      const normalized = normalizeTaskComments(forWrite.comments);
      forWrite.comments = taskCommentsForFirestore(normalized);
    }
    if (Array.isArray(forWrite.updateEntries)) {
      const normalized = normalizeTaskUpdateEntries(forWrite.updateEntries);
      forWrite.updateEntries = taskUpdateEntriesForFirestore(normalized);
    }
    if (forWrite.updateEntries != null && Array.isArray(forWrite.updateEntries) && forWrite.updateEntries.length > 0) {
      forWrite.updates = "";
      delete forWrite.updatesByUser;
      forWrite.updatesByUser = deleteField();
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
    if (patch.appointmentId === "") {
      forWrite.appointmentId = deleteField();
    }
    await updateDoc(
      ref,
      scrub(stripUndefinedDeep(forWrite) as Record<string, unknown>) as DocumentData
    );

    if (before) {
      const after = mergeTaskPatch(before, patch);
      if (patch.status === "done" && !isTaskCompleted(before)) {
        after.completedAt = new Date().toISOString();
      }
      if (isTaskCompleted(before) && patch.status != null && patch.status !== "done") {
        delete after.completedAt;
      }
      setTasks((prev) => prev.map((t) => (t.id === id ? after : t)));
      try {
        const deltas = computePersonStatDeltas(before, after, people, options);
        await applyPersonStatDeltas(deltas);
      } catch (e) {
        console.error("applyPersonStatDeltas", e);
      }
    }

    if (!options?.skipCalendarSync) {
      void syncCrmItemToGoogleCalendar("task", id);
      const aptIds = new Set<string>();
      const prevApt = before?.appointmentId?.trim();
      const nextApt = (patch.appointmentId !== undefined
        ? String(patch.appointmentId ?? "").trim()
        : before?.appointmentId?.trim()) ?? "";
      if (prevApt) aptIds.add(prevApt);
      if (nextApt) aptIds.add(nextApt);
      for (const aptId of aptIds) {
        void syncCrmItemToGoogleCalendar("appointment", aptId);
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

  const cancelTaskOccurrence = useCallback(
    async (id: string, occurrenceIndex: number, scope: TaskCancelScope, canceledById: string) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task) return;

      const occ = expandTaskOccurrences(task).find((o) => o.index === occurrenceIndex);
      if (!occ) return;

      if (scope === "entire_series" || !isRecurringTask(task)) {
        await cancelTask(id, canceledById);
        return;
      }

      if (scope === "instance") {
        const existing = new Set(task.canceledOccurrenceIndices ?? []);
        existing.add(occurrenceIndex);
        await updateTask(id, {
          canceledOccurrenceIndices: [...existing].sort((a, b) => a - b),
        });
        return;
      }

      await updateTask(id, {
        recurrenceCanceledFrom: taskAnchorIso(occ.dueDate),
      });
    },
    [cancelTask, updateTask]
  );

  const sendTaskCreatedNotifications = useCallback(
    async (taskIds: string[], actorId: string) => {
      const actor = people.find((p) => p.id === actorId);
      const locale = loadLocale();
      const actorName = actor?.name ?? translate(locale, "common.someone");
      for (const id of taskIds) {
        const task = tasksRef.current.find((t) => t.id === id);
        if (!task) continue;
        const notifyIds = recipientsForNewTask(task, people, actorId);
        if (notifyIds.length > 0) {
          try {
            await createNotificationsForTaskEvent(
              db,
              ORG,
              task,
              actorId,
              actorName,
              notifyIds,
              "task_created",
              translate(locale, "data.notify.taskCreated", {
                actor: actorName,
                title: task.title.trim() || translate(locale, "common.untitledTask"),
              })
            );
          } catch (e) {
            console.error("sendTaskCreatedNotifications", e);
          }
        }
        try {
          await applyPersonStatDeltas(statDeltaForNewTask(actorId));
        } catch (e) {
          console.error("sendTaskCreatedNotifications stats", e);
        }
      }
    },
    [db, people, applyPersonStatDeltas]
  );

  const createTask = useCallback(
    async (
      payload: Omit<Task, "id" | "createdAt">,
      options?: {
        skipCalendarSync?: boolean;
        skipNotifications?: boolean;
        skipStats?: boolean;
        taskId?: string;
      }
    ): Promise<string> => {
      const ref = options?.taskId
        ? doc(db, "organizations", ORG, "tasks", options.taskId)
        : doc(collection(db, "organizations", ORG, "tasks"));
      const id = ref.id;
      const assigneeIds = [...new Set((payload.assigneeIds ?? []).filter(Boolean))];
      const assigneeDepartmentIds = [...new Set((payload.assigneeDepartmentIds ?? []).filter(Boolean))];
      const recurrenceRule = normalizeRecurrenceRule(payload.recurrenceRule);
      const recurrenceOngoing = Boolean(payload.recurrenceOngoing && recurrenceRule);
      const recurrenceCount =
        recurrenceRule && !recurrenceOngoing && payload.recurrenceCount != null
          ? normalizeRecurrenceCount(payload.recurrenceCount)
          : undefined;
      const {
        recurrenceRule: _rr,
        recurrenceCount: _rc,
        recurrenceOngoing: _ro,
        ...payloadRest
      } = payload;
      const row: Task = {
        ...payloadRest,
        assigneeIds,
        assigneeDepartmentIds,
        ...(recurrenceRule && (recurrenceOngoing || recurrenceCount)
          ? {
              recurrenceRule,
              ...(recurrenceOngoing ? { recurrenceOngoing: true } : { recurrenceCount }),
            }
          : {}),
        finishedByIds: payload.finishedByIds ?? [],
        feedbackByIds: payload.feedbackByIds ?? [],
        feedbackRequests: payload.feedbackRequests ?? [],
        description: sanitizeTaskUpdates(payload.description ?? ""),
        updates: sanitizeTaskUpdates(payload.updates ?? ""),
        updatesByUser: normalizeUpdatesByUser(payload.updatesByUser),
        updateEntries: normalizeTaskUpdateEntries(payload.updateEntries ?? []),
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
      if (!options?.skipNotifications) {
        const notifyIds = recipientsForNewTask(row, people, creatorId);
        if (notifyIds.length > 0 && creatorId) {
          const actor = people.find((p) => p.id === creatorId);
          const locale = loadLocale();
          const actorName = actor?.name ?? translate(locale, "common.someone");
          try {
            await createNotificationsForTaskEvent(
              db,
              ORG,
              row,
              creatorId,
              actorName,
              notifyIds,
              "task_created",
              translate(locale, "data.notify.taskCreated", {
                actor: actorName,
                title: row.title.trim() || translate(locale, "common.untitledTask"),
              })
            );
          } catch (e) {
            console.error("createTask notifications", e);
          }
        }
      }

      if (!options?.skipStats) {
        await applyPersonStatDeltas(statDeltaForNewTask(creatorId));
      }
      if (!options?.skipCalendarSync) {
        void syncCrmItemToGoogleCalendar("task", id);
        const aptId = String(payload.appointmentId ?? "").trim();
        if (aptId) void syncCrmItemToGoogleCalendar("appointment", aptId);
      }
      return id;
    },
    [db, people, applyPersonStatDeltas]
  );

  const removeTask = useCallback(
    async (id: string) => {
      const before = tasksRef.current.find((t) => t.id === id);
      const storagePaths = before ? storagePathsFromTask(before) : [];
      await deleteDoc(doc(db, "organizations", ORG, "tasks", id));
      if (storagePaths.length > 0) {
        void deleteImagesFromStorage(storagePaths);
      }
      void syncCrmItemToGoogleCalendar("task", id, "delete");
      const aptId = before?.appointmentId?.trim();
      if (aptId) void syncCrmItemToGoogleCalendar("appointment", aptId);
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
        departmentIds,
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
        body.departmentIds = normalizeAssigneeDepartments(patch.departmentIds);
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
      for (const t of tasksRef.current) {
        if (t.projectId === id) {
          void syncCrmItemToGoogleCalendar("task", t.id);
        }
      }
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
    const trimmed = trimContactTextFields(fields);
    if (typeof trimmed.generalNotes === "string") {
      trimmed.generalNotes = sanitizeTaskUpdates(trimmed.generalNotes);
    }
    if ("lastContactedAt" in trimmed && !String(trimmed.lastContactedAt ?? "").trim()) {
      trimmed.lastContactedAt = deleteField() as unknown as string;
    }
    const ref = doc(db, "organizations", ORG, "contacts", id);
    const body = scrub({ ...trimmed, id } as unknown as Record<string, unknown>);
    if (Object.keys(body).length === 0) return;

    const localPatch = { ...trimmed };
    if ("lastContactedAt" in localPatch && typeof localPatch.lastContactedAt !== "string") {
      localPatch.lastContactedAt = "";
    }
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...localPatch } : c))
    );

    await updateDoc(ref, body as DocumentData);
  }, [db]);

  const removeContact = useCallback(
    async (id: string) => {
      const contact = contactsRef.current.find((c) => c.id === id);
      const storagePaths = contact ? storagePathsFromContact(contact) : [];
      const remSnap = await getDocs(collection(db, "organizations", ORG, "contacts", id, "reminders"));
      const batch = writeBatch(db);
      remSnap.docs.forEach((r) => batch.delete(r.ref));
      batch.delete(doc(db, "organizations", ORG, "contacts", id));
      await batch.commit();
      if (storagePaths.length > 0) {
        void deleteImagesFromStorage(storagePaths);
      }
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
      const contact = contactsRef.current.find((c) => c.id === contactId);
      const reminder = contact?.reminders.find((r) => r.id === reminderId);
      const storagePaths = reminder ? storagePathsFromContactReminder(reminder) : [];
      await deleteDoc(doc(db, "organizations", ORG, "contacts", contactId, "reminders", reminderId));
      await refreshContactReminders(contactId);
      if (storagePaths.length > 0) {
        void deleteImagesFromStorage(storagePaths);
      }
    },
    [db, refreshContactReminders]
  );

  const updatePersonOrgRole = useCallback(
    async (personId: string, orgRole: OrgRole) => {
      if (!hasPrivilege(currentUserOrgRole, "manageOrgRoles")) {
        throw new Error("You do not have permission to change roles.");
      }
      await updateDoc(doc(db, "organizations", ORG, "people", personId), { orgRole, id: personId });
      await updateDoc(doc(db, "users", personId), { orgRole, updatedAt: new Date().toISOString() });
      await ensureFoundersChat(db, ORG, people);
    },
    [db, currentUserOrgRole, people]
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
      clearProfileSetupPending(currentUserPersonId);
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
    async (
      payload: Omit<Appointment, "id" | "createdAt" | "status">,
      appointmentId?: string,
      options?: { skipCalendarSync?: boolean }
    ) => {
      const ref = appointmentId
        ? doc(db, "organizations", ORG, "appointments", appointmentId)
        : doc(collection(db, "organizations", ORG, "appointments"));
      const id = ref.id;
      const participantIds = [...new Set((payload.participantIds ?? []).filter(Boolean))];
      const participantDepartmentIds = [
        ...new Set((payload.participantDepartmentIds ?? []).filter(Boolean)),
      ];
      const linkedTaskIds = [...new Set((payload.linkedTaskIds ?? []).filter(Boolean))];
      const recurrenceRule = normalizeRecurrenceRule(payload.recurrenceRule);
      const recurrenceOngoing = Boolean(payload.recurrenceOngoing && recurrenceRule);
      const recurrenceCount =
        recurrenceRule && !recurrenceOngoing && payload.recurrenceCount != null
          ? normalizeRecurrenceCount(payload.recurrenceCount)
          : undefined;
      const { description: rawDescription, recurrenceRule: _rr, recurrenceCount: _rc, recurrenceOngoing: _ro, ...payloadRest } =
        payload;
      const description =
        typeof rawDescription === "string" ? sanitizeTaskUpdates(rawDescription) : undefined;
      const row: Appointment = {
        ...payloadRest,
        participantIds,
        participantDepartmentIds,
        ...(linkedTaskIds.length > 0 ? { linkedTaskIds } : {}),
        ...(recurrenceRule && (recurrenceOngoing || recurrenceCount)
          ? {
              recurrenceRule,
              ...(recurrenceOngoing ? { recurrenceOngoing: true } : { recurrenceCount }),
            }
          : {}),
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
      if (!options?.skipCalendarSync) {
        void syncCrmItemToGoogleCalendar("appointment", id);
      }
      return id;
    },
    [db]
  );

  const updateAppointment = useCallback(
    async (
      id: string,
      patch: Partial<Appointment>,
      options?: { skipCalendarSync?: boolean }
    ) => {
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
      if ("projectId" in forWrite && !String(forWrite.projectId ?? "").trim()) {
        forWrite.projectId = deleteField();
      }
      if ("prepNotes" in forWrite && !String(forWrite.prepNotes ?? "").trim()) {
        forWrite.prepNotes = deleteField();
      }
      if (Array.isArray(forWrite.reviewItems)) {
        const items = [
          ...new Set((forWrite.reviewItems as string[]).map((x) => String(x).trim()).filter(Boolean)),
        ];
        if (items.length === 0) {
          forWrite.reviewItems = deleteField();
        } else {
          forWrite.reviewItems = items;
          forWrite.prepNotes = deleteField();
        }
      }
      if (Array.isArray(forWrite.linkedTaskIds)) {
        const ids = [...new Set((forWrite.linkedTaskIds as string[]).filter(Boolean))];
        if (ids.length === 0) {
          forWrite.linkedTaskIds = deleteField();
        } else {
          forWrite.linkedTaskIds = ids;
        }
      }
      if (Array.isArray(forWrite.attachments)) {
        forWrite.attachments =
          forWrite.attachments.length > 0
            ? imageAttachmentsForFirestore(forWrite.attachments as ImageAttachment[])
            : deleteField();
      }
      if ("occurrenceFields" in forWrite) {
        const normalized = normalizeOccurrenceFieldsMap(forWrite.occurrenceFields);
        if (!normalized || Object.keys(normalized).length === 0) {
          forWrite.occurrenceFields = deleteField();
        } else {
          forWrite.occurrenceFields = normalized;
        }
      }
      const body = scrub(stripUndefinedDeep(forWrite) as Record<string, unknown>) as Record<string, unknown>;
      if (Object.keys(body).length === 0) return;
      await updateDoc(ref, body as DocumentData);
      if (!options?.skipCalendarSync) {
        void syncCrmItemToGoogleCalendar("appointment", id);
      }

      if ("taskId" in patch) {
        const linked = personalRemindersRef.current.filter((r) => r.appointmentId === id);
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
          for (const r of linked) {
            void syncCrmItemToGoogleCalendar("personalReminder", r.id);
          }
        }
      }
    },
    [db]
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
            actor?.name?.trim() || actor?.email?.trim() || translate(loadLocale(), "common.someone"),
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
              actor?.name?.trim() || actor?.email?.trim() || translate(loadLocale(), "common.someone"),
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
      const before = personalRemindersRef.current.find((r) => r.id === id);
      const storagePaths = before ? storagePathsFromPersonalReminder(before) : [];
      await deleteDoc(doc(db, "organizations", ORG, "personalReminders", id));
      if (storagePaths.length > 0) {
        void deleteImagesFromStorage(storagePaths);
      }
      void syncCrmItemToGoogleCalendar("personalReminder", id, "delete");
    },
    [db]
  );

  const createResearchItem = useCallback(
    async (
      payload: Omit<ResearchItem, "id" | "createdAt" | "updatedAt">,
      itemId?: string
    ): Promise<string> => {
      const ref = itemId
        ? doc(db, "organizations", ORG, "research", itemId)
        : doc(collection(db, "organizations", ORG, "research"));
      const id = ref.id;
      const notes =
        typeof payload.notes === "string" ? sanitizeTaskUpdates(payload.notes) : "";
      const now = new Date().toISOString();
      const row: Record<string, unknown> = {
        id,
        title: String(payload.title ?? "").trim(),
        notes: richTextHasContent(notes) ? notes : "",
        createdById: payload.createdById,
        createdAt: now,
        updatedAt: now,
      };
      if (payload.attachments?.length) {
        row.attachments = imageAttachmentsForFirestore(payload.attachments);
      }
      await setDoc(ref, scrub(row));
      return id;
    },
    [db]
  );

  const updateResearchItem = useCallback(
    async (id: string, patch: Partial<ResearchItem>) => {
      const ref = doc(db, "organizations", ORG, "research", id);
      const forWrite = { ...patch } as Record<string, unknown>;
      delete forWrite.id;
      delete forWrite.createdAt;
      delete forWrite.createdById;
      if ("title" in forWrite) {
        forWrite.title = String(forWrite.title ?? "").trim();
      }
      if ("notes" in forWrite) {
        const safe = sanitizeTaskUpdates(String(forWrite.notes ?? ""));
        forWrite.notes = richTextHasContent(safe) ? safe : "";
      }
      if (Array.isArray(forWrite.attachments)) {
        forWrite.attachments =
          forWrite.attachments.length > 0
            ? imageAttachmentsForFirestore(forWrite.attachments as ImageAttachment[])
            : deleteField();
      }
      forWrite.updatedAt = new Date().toISOString();
      await updateDoc(ref, scrub(forWrite) as DocumentData);
    },
    [db]
  );

  const removeResearchItem = useCallback(
    async (id: string) => {
      const before = researchItemsRef.current.find((r) => r.id === id);
      const storagePaths = before ? storagePathsFromResearchItem(before) : [];
      await deleteDoc(doc(db, "organizations", ORG, "research", id));
      if (storagePaths.length > 0) {
        void deleteImagesFromStorage(storagePaths);
      }
    },
    [db]
  );

  const cancelAppointment = useCallback(
    async (id: string) => {
      const apt = appointmentsRef.current.find((a) => a.id === id);
      const now = new Date().toISOString();
      const patch: Partial<Appointment> = {
        status: "canceled",
        canceledAt: now,
      };
      if (apt && isRecurringAppointment(apt)) {
        patch.recurrenceCanceledFrom = now;
      }

      if (apt?.recurrenceSeriesId && (apt.recurrenceIndex ?? 0) === 0) {
        const siblings = appointmentsRef.current.filter(
          (a) => a.recurrenceSeriesId === apt.recurrenceSeriesId
        );
        for (const sibling of siblings) {
          await updateAppointment(sibling.id, patch);
        }
        return;
      }

      await updateAppointment(id, patch);
    },
    [updateAppointment]
  );

  const cancelAppointmentOccurrence = useCallback(
    async (id: string, occurrenceIndex: number, scope: AppointmentCancelScope) => {
      const apt = appointmentsRef.current.find((a) => a.id === id);
      if (!apt) return;

      const occ = expandAppointmentOccurrences(apt).find((o) => o.index === occurrenceIndex);
      if (!occ) return;
      if (isOccurrencePast(occ)) {
        throw new Error("Cannot modify a meeting that has already ended.");
      }

      if (scope === "entire_series" || !isRecurringAppointment(apt)) {
        await cancelAppointment(id);
        return;
      }

      if (scope === "instance") {
        const existing = new Set(apt.canceledOccurrenceIndices ?? []);
        existing.add(occurrenceIndex);
        await updateAppointment(id, {
          canceledOccurrenceIndices: [...existing].sort((a, b) => a - b),
        });
        return;
      }

      await updateAppointment(id, {
        recurrenceCanceledFrom: occ.startsAt,
      });
    },
    [cancelAppointment, updateAppointment]
  );

  const removeAppointment = useCallback(
    async (id: string) => {
      const before = appointmentsRef.current.find((a) => a.id === id);
      const idsToDelete = new Set<string>([id]);

      if (before?.recurrenceSeriesId && (before.recurrenceIndex ?? 0) === 0) {
        for (const sibling of appointmentsRef.current) {
          if (sibling.recurrenceSeriesId === before.recurrenceSeriesId) {
            idsToDelete.add(sibling.id);
          }
        }
      }

      const linkedTaskIds = new Set<string>();
      for (const taskId of before?.linkedTaskIds ?? []) {
        if (taskId) linkedTaskIds.add(taskId);
      }
      for (const t of tasksRef.current) {
        if (t.appointmentId === id) linkedTaskIds.add(t.id);
      }

      const linkedReminderIds = personalRemindersRef.current
        .filter((r) => r.appointmentId === id)
        .map((r) => r.id);

      const storagePaths = [
        ...new Set(
          [...idsToDelete].flatMap((aptId) => {
            const apt = appointmentsRef.current.find((a) => a.id === aptId);
            return apt ? storagePathsFromAppointment(apt) : [];
          })
        ),
      ];

      for (const aptId of idsToDelete) {
        await deleteDoc(doc(db, "organizations", ORG, "appointments", aptId));
      }
      if (storagePaths.length > 0) {
        void deleteImagesFromStorage(storagePaths);
      }
      for (const aptId of idsToDelete) {
        void syncCrmItemToGoogleCalendar("appointment", aptId, "delete");
      }
      for (const taskId of linkedTaskIds) {
        void syncCrmItemToGoogleCalendar("task", taskId);
      }
      for (const reminderId of linkedReminderIds) {
        void syncCrmItemToGoogleCalendar("personalReminder", reminderId);
      }
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

      const editingOther = id !== currentUserPersonId;
      const isFounder = hasPrivilege(currentUserOrgRole, "manageOrgRoles");

      if (editingOther && !isFounder) {
        delete fields.name;
        delete fields.title;
        delete fields.departments;
      }

      if (fields.departments !== undefined && !isFounder) {
        delete fields.departments;
      }
      if (typeof fields.name === "string") {
        fields.name = fields.name.trim();
        if (!fields.name) delete fields.name;
      }
      if (typeof fields.title === "string") fields.title = fields.title.trim();
      const ref = doc(db, "organizations", ORG, "people", id);
      const body = scrub({ ...fields, id } as unknown as Record<string, unknown>);
      if (Array.isArray(fields.departments)) {
        body.departments = [...new Set(fields.departments.map((d) => d.trim()).filter(Boolean))];
        body.department = deleteField();
      }
      if (fields.avatarUrl === "") body.avatarUrl = deleteField();
      if (fields.avatarStoragePath === "") body.avatarStoragePath = deleteField();
      if (Array.isArray(fields.starredTaskIds)) {
        body.starredTaskIds =
          fields.starredTaskIds.length > 0 ? [...new Set(fields.starredTaskIds.filter(Boolean))] : deleteField();
      }
      if (Object.keys(body).length > 0) {
        const updatedAt = new Date().toISOString();
        body.updatedAt = updatedAt;
        await updateDoc(ref, body as DocumentData);
        if (typeof fields.name === "string" && fields.name && (id === currentUserPersonId || isFounder)) {
          await updateDoc(doc(db, "users", id), {
            displayName: fields.name,
            updatedAt,
          });
        }
      }
    },
    [db, currentUserPersonId, currentUserOrgRole]
  );

  const toggleTaskStar = useCallback(
    async (taskId: string) => {
      const id = taskId.trim();
      if (!id || !currentUserPersonId) return;
      const person = people.find((p) => p.id === currentUserPersonId);
      if (!person) return;

      const nextSet = new Set(person.starredTaskIds ?? []);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      const next = [...nextSet];

      setPeopleRaw((prev) =>
        prev.map((p) => (p.id === currentUserPersonId ? { ...p, starredTaskIds: next } : p))
      );
      setSelfPersonDoc((prev) =>
        prev.person?.id === currentUserPersonId
          ? { ...prev, person: { ...prev.person, starredTaskIds: next } }
          : prev
      );

      const ref = doc(db, "organizations", ORG, "people", currentUserPersonId);
      await updateDoc(ref, {
        starredTaskIds: next.length > 0 ? next : deleteField(),
      });
    },
    [db, currentUserPersonId, people]
  );

  return {
    user,
    authLoading,
    dataLoading,
    error,
    people: visiblePeople,
    tasks: visibleTasks,
    allTasks: tasks,
    projects: visibleProjects,
    contacts: visibleContacts,
    researchItems: visibleResearchItems,
    appointments: visibleAppointments,
    personalReminders: visiblePersonalReminders,
    notifications,
    registrationSeeds,
    currentUserPersonId,
    currentUserOrgRole,
    profileGateLoading,
    requiresProfileSetup,
    profileSetupPerson,
    canAccessSettings,
    canManageProjects,
    canAccessContacts: canSeeContacts,
    canAccessResearch,
    canAccessStrategicPlan,
    seesAllOrgData,
    markNotificationRead,
    markChatNotificationsRead,
    markAllNotificationsRead,
    notifyEveryoneAboutTask,
    notifyTaskComment,
    notifyCommentReaction,
    notifyTaskAction,
    notifyTaskFeedbackReply,
    updateTask,
    createTask,
    sendTaskCreatedNotifications,
    cancelTask,
    cancelTaskOccurrence,
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
    cancelAppointmentOccurrence,
    removeAppointment,
    addPersonalReminder,
    updatePersonalReminder,
    removePersonalReminder,
    createResearchItem,
    updateResearchItem,
    removeResearchItem,
    updatePerson,
    updatePersonOrgRole,
    toggleTaskStar,
    starredTaskIds,
    issueRegistrationSeed,
    completeProfileSetup,
  };
}
