import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { getFirebaseAuth, getFirestoreDb, SIMASIA_AI_ORG_ID } from "./firebase/config";
import { normalizeContact, normalizePerson, normalizeReminder, normalizeTask } from "./firebase/normalizeFirestore";
import type { ContactReminder, Person, SalesContact, Task } from "./types";

const ORG = SIMASIA_AI_ORG_ID;

function scrub<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function useOrgFirestore() {
  const db = getFirestoreDb();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<SalesContact[]>([]);

  const contactsReq = useRef(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setPeople([]);
      setTasks([]);
      setContacts([]);
      setDataLoading(false);
      setError(null);
      return;
    }

    setDataLoading(true);
    setError(null);

    const peopleCol = collection(db, "organizations", ORG, "people");
    const tasksCol = collection(db, "organizations", ORG, "tasks");
    const contactsCol = collection(db, "organizations", ORG, "contacts");

    const fail = (msg: string) => {
      setError(msg);
      setDataLoading(false);
    };

    const unPeople = onSnapshot(
      peopleCol,
      (snap) => {
        const list = snap.docs.map((d) => normalizePerson(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setPeople(list);
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
    const byUid = people.find((p) => p.authUid === user.uid);
    if (byUid) return byUid.id;
    const byEmail = people.find((p) => p.email.toLowerCase() === user.email?.toLowerCase());
    return byEmail?.id ?? user.uid;
  }, [user, people]);

  const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
    const ref = doc(db, "organizations", ORG, "tasks", id);
    const { id: _omitId, ...rest } = patch as Partial<Task> & { id?: string };
    const forWrite = { ...rest } as Record<string, unknown>;
    if (Array.isArray(forWrite.assigneeIds)) {
      const ids = [...new Set((forWrite.assigneeIds as string[]).filter(Boolean))];
      forWrite.assigneeIds = ids;
      forWrite.assigneeId = ids[0] ?? "";
    }
    await updateDoc(ref, scrub(forWrite as Record<string, unknown>) as DocumentData);
  }, [db]);

  const createTask = useCallback(
    async (payload: Omit<Task, "id" | "createdAt">) => {
      const ref = doc(collection(db, "organizations", ORG, "tasks"));
      const id = ref.id;
      const assigneeIds = [...new Set((payload.assigneeIds ?? []).filter(Boolean))];
      const row: Task = {
        ...payload,
        assigneeIds,
        id,
        createdAt: new Date().toISOString(),
      };
      await setDoc(ref, {
        ...(row as unknown as Record<string, unknown>),
        assigneeId: assigneeIds[0] ?? "",
      } as Record<string, unknown>);
    },
    [db]
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

  const addReminder = useCallback(
    async (contactId: string, r: Omit<ContactReminder, "id" | "done">) => {
      const ref = doc(collection(db, "organizations", ORG, "contacts", contactId, "reminders"));
      await setDoc(ref, { title: r.title, dueAt: r.dueAt, notes: r.notes, done: false });
    },
    [db]
  );

  const updateReminder = useCallback(
    async (contactId: string, reminderId: string, patch: Partial<ContactReminder>) => {
      const ref = doc(db, "organizations", ORG, "contacts", contactId, "reminders", reminderId);
      const { id: _omit, ...rest } = patch as Partial<ContactReminder> & { id?: string };
      await updateDoc(ref, scrub(rest as unknown as Record<string, unknown>) as DocumentData);
    },
    [db]
  );

  const removeReminder = useCallback(
    async (contactId: string, reminderId: string) => {
      await deleteDoc(doc(db, "organizations", ORG, "contacts", contactId, "reminders", reminderId));
    },
    [db]
  );

  return {
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
  };
}
