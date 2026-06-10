import { canSeeAllOrgData, type OrgRole } from "../auth/roles";
import type { Appointment, Person, PersonalReminder, Project, Task } from "../types";
import { TEAM_DEPARTMENTS } from "../types";
import { isAppointmentRelevantToPerson } from "./appointments";
import { isPersonalReminderRelevantToPerson } from "./personalReminderLinks";
import { normalizeAssigneeDepartments } from "./taskAssignees";

export function viewerDepartments(person: Person | undefined): string[] {
  return person?.departments ?? [];
}

export function departmentsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((d) => set.has(d));
}

export function projectDepartmentIds(project: Project): string[] {
  return normalizeAssigneeDepartments(project.departmentIds ?? []);
}

/** Founders see all projects; partners only see projects scoped to their department(s). */
export function projectVisibleToViewer(
  project: Project,
  viewer: Person | undefined,
  role: OrgRole
): boolean {
  if (canSeeAllOrgData(role)) return true;
  const depts = projectDepartmentIds(project);
  if (depts.length === 0) return false;
  return departmentsOverlap(depts, viewerDepartments(viewer));
}

/** Task belongs to a partner's department via assignee departments or direct assignment. */
export function taskInViewerDepartment(task: Task, viewer: Person | undefined): boolean {
  if (!viewer) return false;
  if (task.assigneeIds.includes(viewer.id)) return true;
  const viewerDepts = viewerDepartments(viewer);
  if (viewerDepts.length === 0) return false;
  const taskDepts = normalizeAssigneeDepartments(task.assigneeDepartmentIds);
  return departmentsOverlap(taskDepts, viewerDepts);
}

/** Founders see all tasks; partners see dept tasks or everything inside a visible project. */
export function taskVisibleToViewer(
  task: Task,
  viewer: Person | undefined,
  viewerId: string,
  people: Person[],
  projects: Project[],
  role: OrgRole
): boolean {
  if (canSeeAllOrgData(role)) return true;
  if (task.projectId) {
    const project = projects.find((p) => p.id === task.projectId);
    if (project && projectVisibleToViewer(project, viewer, role)) return true;
  }
  void people;
  void viewerId;
  return taskInViewerDepartment(task, viewer);
}

export function appointmentVisibleToViewer(
  apt: Appointment,
  viewerId: string,
  people: Person[],
  role: OrgRole
): boolean {
  if (canSeeAllOrgData(role)) return true;
  return isAppointmentRelevantToPerson(apt, viewerId, people);
}

export function reminderVisibleToViewer(
  reminder: PersonalReminder,
  viewerId: string,
  people: Person[],
  role: OrgRole
): boolean {
  if (canSeeAllOrgData(role)) return true;
  return isPersonalReminderRelevantToPerson(reminder, viewerId, people);
}

/** Partners see teammates who share at least one department (for assignee pickers, team tab). */
export function personVisibleToViewer(
  person: Person,
  viewer: Person | undefined,
  role: OrgRole
): boolean {
  if (canSeeAllOrgData(role)) return true;
  if (viewer && person.id === viewer.id) return true;
  return departmentsOverlap(person.departments, viewerDepartments(viewer));
}

/** Founders + anyone who can see or is tied to this task (assigner, assignee, dept, project). */
export function personMentionableOnTask(
  task: Task,
  person: Person,
  people: Person[],
  projects: Project[]
): boolean {
  if (canSeeAllOrgData(person.orgRole)) return true;
  if (task.assignedById === person.id) return true;
  return taskVisibleToViewer(task, person, person.id, people, projects, person.orgRole);
}

export function peopleMentionableOnTask(task: Task, people: Person[], projects: Project[]): Person[] {
  return people.filter((p) => personMentionableOnTask(task, p, people, projects));
}

/** Departments on this task (and its project) — safe @department targets in comments. */
export function departmentsMentionableOnTask(task: Task, projects: Project[]): string[] {
  const depts = new Set(normalizeAssigneeDepartments(task.assigneeDepartmentIds));
  if (task.projectId) {
    const project = projects.find((p) => p.id === task.projectId);
    if (project) {
      for (const d of projectDepartmentIds(project)) depts.add(d);
    }
  }
  return TEAM_DEPARTMENTS.filter((d) => depts.has(d));
}
