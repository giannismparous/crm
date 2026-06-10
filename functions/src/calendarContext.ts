import type { Firestore } from "firebase-admin/firestore";
import { ORG_ID, type CrmType } from "./constants";
import type { CrmAppointment, CrmPersonalReminder, CrmTask } from "./crmData";

export interface CalendarPerson {
  id: string;
  name: string;
  departments: string[];
}

export interface CalendarProject {
  id: string;
  name: string;
}

export interface CalendarContact {
  id: string;
  label: string;
}

export interface CalendarBuildContext {
  people: Map<string, CalendarPerson>;
  projects: Map<string, CalendarProject>;
  contacts: Map<string, CalendarContact>;
}

export interface CalendarRelatedData {
  linkedTasks: CrmTask[];
  linkedAppointment: CrmAppointment | null;
  linkedTask: CrmTask | null;
  linkedContact: CalendarContact | null;
}

function normalizeDepts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((d) => String(d).trim()).filter(Boolean))];
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x).trim()).filter(Boolean))];
}

export async function loadCalendarBuildContext(db: Firestore): Promise<CalendarBuildContext> {
  const [peopleSnap, projectsSnap, contactsSnap] = await Promise.all([
    db.collection(`organizations/${ORG_ID}/people`).get(),
    db.collection(`organizations/${ORG_ID}/projects`).get(),
    db.collection(`organizations/${ORG_ID}/contacts`).get(),
  ]);

  const people = new Map<string, CalendarPerson>();
  for (const doc of peopleSnap.docs) {
    const data = doc.data();
    people.set(doc.id, {
      id: doc.id,
      name: String(data.name ?? "").trim() || "Member",
      departments: normalizeDepts(data.departments),
    });
  }

  const projects = new Map<string, CalendarProject>();
  for (const doc of projectsSnap.docs) {
    const data = doc.data();
    projects.set(doc.id, {
      id: doc.id,
      name: String(data.name ?? "").trim() || "Project",
    });
  }

  const contacts = new Map<string, CalendarContact>();
  for (const doc of contactsSnap.docs) {
    const data = doc.data();
    const first = String(data.firstName ?? "").trim();
    const last = String(data.lastName ?? "").trim();
    const company = String(data.company ?? "").trim();
    const label = [first, last].filter(Boolean).join(" ").trim() || company || "Contact";
    contacts.set(doc.id, { id: doc.id, label });
  }

  return { people, projects, contacts };
}

async function loadTasksForAppointment(db: Firestore, apt: CrmAppointment): Promise<CrmTask[]> {
  const explicit = [...new Set((apt.linkedTaskIds ?? []).map((x) => String(x).trim()).filter(Boolean))];
  const tasks = new Map<string, CrmTask>();

  if (explicit.length > 0) {
    await Promise.all(
      explicit.map(async (taskId) => {
        const snap = await db.doc(`organizations/${ORG_ID}/tasks/${taskId}`).get();
        if (snap.exists) {
          tasks.set(snap.id, { id: snap.id, ...(snap.data() as object) } as CrmTask);
        }
      })
    );
    return explicit
      .map((id) => tasks.get(id))
      .filter((t): t is CrmTask => Boolean(t))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  const byField = await db
    .collection(`organizations/${ORG_ID}/tasks`)
    .where("appointmentId", "==", apt.id)
    .get();
  for (const doc of byField.docs) {
    tasks.set(doc.id, { id: doc.id, ...(doc.data() as object) } as CrmTask);
  }
  const legacyId = String((apt as { taskId?: string }).taskId ?? "").trim();
  if (legacyId && !tasks.has(legacyId)) {
    const legacy = await db.doc(`organizations/${ORG_ID}/tasks/${legacyId}`).get();
    if (legacy.exists) {
      tasks.set(legacy.id, { id: legacy.id, ...(legacy.data() as object) } as CrmTask);
    }
  }
  return [...tasks.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadRelatedForCalendarEvent(
  db: Firestore,
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder,
  ctx?: CalendarBuildContext
): Promise<CalendarRelatedData> {
  const empty: CalendarRelatedData = {
    linkedTasks: [],
    linkedAppointment: null,
    linkedTask: null,
    linkedContact: null,
  };

  if (crmType === "appointment") {
    const apt = item as CrmAppointment;
    return { ...empty, linkedTasks: await loadTasksForAppointment(db, apt) };
  }

  if (crmType === "task") {
    const task = item as CrmTask & { appointmentId?: string };
    const aptId = String(task.appointmentId ?? "").trim();
    if (!aptId) return empty;
    const snap = await db.doc(`organizations/${ORG_ID}/appointments/${aptId}`).get();
    if (!snap.exists) return empty;
    return {
      ...empty,
      linkedAppointment: { id: snap.id, ...(snap.data() as object) } as CrmAppointment,
    };
  }

  const rem = item as CrmPersonalReminder & {
    taskId?: string;
    appointmentId?: string;
    contactId?: string;
  };
  let linkedTask: CrmTask | null = null;
  let linkedAppointment: CrmAppointment | null = null;

  const taskId = String(rem.taskId ?? "").trim();
  if (taskId) {
    const snap = await db.doc(`organizations/${ORG_ID}/tasks/${taskId}`).get();
    if (snap.exists) linkedTask = { id: snap.id, ...(snap.data() as object) } as CrmTask;
  }

  const aptId = String(rem.appointmentId ?? "").trim();
  if (aptId) {
    const snap = await db.doc(`organizations/${ORG_ID}/appointments/${aptId}`).get();
    if (snap.exists) linkedAppointment = { id: snap.id, ...(snap.data() as object) } as CrmAppointment;
  }

  const contactId = String(rem.contactId ?? "").trim();
  const linkedContact = contactId
    ? ctx?.contacts.get(contactId) ?? { id: contactId, label: "Contact" }
    : null;

  return {
    linkedTasks: [],
    linkedAppointment,
    linkedTask,
    linkedContact,
  };
}

export function personNames(ids: string[] | undefined, ctx: CalendarBuildContext): string {
  const names = normalizeIds(ids).map((id) => ctx.people.get(id)?.name ?? id);
  return names.length > 0 ? names.join(", ") : "";
}

export function departmentLabel(depts: string[] | undefined): string {
  const list = normalizeDepts(depts);
  return list.length > 0 ? list.join(", ") : "";
}
