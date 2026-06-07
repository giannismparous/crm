import type { Firestore } from "firebase-admin/firestore";
import { ORG_ID, type CrmType } from "./constants";
import type { CrmAppointment, CrmPersonalReminder, CrmProject, CrmTask } from "./crmData";

export interface CrmPerson {
  id: string;
  orgRole?: string;
  departments?: string[];
}

export interface OrgContext {
  people: Map<string, CrmPerson>;
  projects: Map<string, CrmProject>;
}

function normalizeDepts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((d) => String(d).trim()).filter(Boolean))];
}

function isFounder(role: string | undefined): boolean {
  return role === "founder" || role === "ceo";
}

function departmentsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((d) => set.has(d));
}

export async function loadOrgContext(db: Firestore): Promise<OrgContext> {
  const [peopleSnap, projectsSnap] = await Promise.all([
    db.collection(`organizations/${ORG_ID}/people`).get(),
    db.collection(`organizations/${ORG_ID}/projects`).get(),
  ]);

  const people = new Map<string, CrmPerson>();
  for (const doc of peopleSnap.docs) {
    const data = doc.data();
    people.set(doc.id, {
      id: doc.id,
      orgRole: String(data.orgRole ?? "partner"),
      departments: normalizeDepts(data.departments),
    });
  }

  const projects = new Map<string, CrmProject>();
  for (const doc of projectsSnap.docs) {
    const data = doc.data();
    projects.set(doc.id, {
      id: doc.id,
      departmentIds: normalizeDepts(data.departmentIds),
    });
  }

  return { people, projects };
}

function projectVisibleToPartner(project: CrmProject, person: CrmPerson): boolean {
  const depts = normalizeDepts(project.departmentIds);
  if (depts.length === 0) return false;
  return departmentsOverlap(depts, person.departments ?? []);
}

function taskVisibleToUser(
  ctx: OrgContext,
  uid: string,
  task: CrmTask,
  person: CrmPerson
): boolean {
  if (isFounder(person.orgRole)) return true;

  if ((task.assigneeIds ?? []).includes(uid)) return true;

  const taskDepts = normalizeDepts(task.assigneeDepartmentIds);
  if (departmentsOverlap(taskDepts, person.departments ?? [])) return true;

  const projectId = String(task.projectId ?? "").trim();
  if (projectId) {
    const project = ctx.projects.get(projectId);
    if (project && projectVisibleToPartner(project, person)) return true;
  }

  return false;
}

function appointmentVisibleToUser(
  uid: string,
  apt: CrmAppointment,
  person: CrmPerson
): boolean {
  if (isFounder(person.orgRole)) return true;

  if (apt.createdById === uid) return true;
  if ((apt.participantIds ?? []).includes(uid)) return true;

  const inviteDepts = normalizeDepts(apt.participantDepartmentIds);
  if (inviteDepts.length === 0) return false;
  return inviteDepts.some((d) => (person.departments ?? []).includes(d));
}

function reminderVisibleToUser(
  uid: string,
  rem: CrmPersonalReminder,
  person: CrmPerson
): boolean {
  if (isFounder(person.orgRole)) return true;

  if (rem.ownerId === uid) return true;
  if ((rem.participantIds ?? []).includes(uid)) return true;

  const inviteDepts = normalizeDepts(rem.participantDepartmentIds);
  if (inviteDepts.length === 0) return false;
  return inviteDepts.some((d) => (person.departments ?? []).includes(d));
}

/** Mirrors CRM partner/founder visibility — only items the user may see in the app. */
export function itemVisibleToUser(
  ctx: OrgContext,
  uid: string,
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder
): boolean {
  const person = ctx.people.get(uid);
  if (!person) return false;

  if (crmType === "task") return taskVisibleToUser(ctx, uid, item as CrmTask, person);
  if (crmType === "appointment") {
    return appointmentVisibleToUser(uid, item as CrmAppointment, person);
  }
  return reminderVisibleToUser(uid, item as CrmPersonalReminder, person);
}
