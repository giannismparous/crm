import type { Firestore } from "firebase-admin/firestore";
import { ORG_ID, type CrmType } from "./constants";
import type { CrmAppointment, CrmPersonalReminder, CrmProject, CrmTask } from "./crmData";

export interface CrmPerson {
  id: string;
  authUid?: string;
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
      authUid: String(data.authUid ?? doc.id).trim() || doc.id,
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

function projectOrgWide(departmentIds: string[] | undefined): boolean {
  const depts = normalizeDepts(departmentIds);
  return depts.length === 0 || depts.includes("General");
}

function projectVisibleToPartner(project: CrmProject, person: CrmPerson): boolean {
  if (projectOrgWide(project.departmentIds)) return true;
  return departmentsOverlap(normalizeDepts(project.departmentIds), person.departments ?? []);
}

function personForAuthUid(ctx: OrgContext, uid: string): CrmPerson | undefined {
  const direct = ctx.people.get(uid);
  if (direct) return direct;
  for (const person of ctx.people.values()) {
    if (person.authUid === uid) return person;
  }
  return undefined;
}

function taskOrgWide(task: CrmTask): boolean {
  const depts = normalizeDepts(task.assigneeDepartmentIds);
  return depts.length === 0 || depts.includes("General");
}

function taskVisibleToUser(
  ctx: OrgContext,
  uid: string,
  task: CrmTask,
  person: CrmPerson
): boolean {
  if (isFounder(person.orgRole)) return true;

  if (task.assignedById === uid || task.assignedById === person.id) return true;
  if ((task.assigneeIds ?? []).includes(uid) || (task.assigneeIds ?? []).includes(person.id)) {
    return true;
  }

  const projectId = String(task.projectId ?? "").trim();
  if (taskOrgWide(task) && !projectId) return true;

  const taskDepts = normalizeDepts(task.assigneeDepartmentIds);
  if (departmentsOverlap(taskDepts, person.departments ?? [])) return true;

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

  if (apt.createdById === uid || apt.createdById === person.id) return true;
  if (
    (apt.participantIds ?? []).includes(uid) ||
    (apt.participantIds ?? []).includes(person.id)
  ) {
    return true;
  }

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

  if (rem.ownerId === uid || rem.ownerId === person.id) return true;
  if (
    (rem.participantIds ?? []).includes(uid) ||
    (rem.participantIds ?? []).includes(person.id)
  ) {
    return true;
  }

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
  const person = personForAuthUid(ctx, uid);
  if (!person) return false;

  if (crmType === "task") return taskVisibleToUser(ctx, uid, item as CrmTask, person);
  if (crmType === "appointment") {
    return appointmentVisibleToUser(uid, item as CrmAppointment, person);
  }
  return reminderVisibleToUser(uid, item as CrmPersonalReminder, person);
}
