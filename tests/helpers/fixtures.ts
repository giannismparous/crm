import type { Appointment, Person, PersonalReminder, Project, Task } from "../../src/types";

export const ORG_ID = "SimasiaAI";

export function makePerson(overrides: Partial<Person> & Pick<Person, "id">): Person {
  return {
    name: "Person",
    title: "Member",
    email: "person@test.local",
    departments: [],
    orgRole: "partner",
    ...overrides,
    id: overrides.id,
  };
}

export function makeProject(overrides: Partial<Project> & Pick<Project, "id">): Project {
  return {
    name: "Project",
    description: "",
    color: "#3366cc",
    departmentIds: ["Engineering"],
    completed: false,
    createdAt: new Date().toISOString(),
    ...overrides,
    id: overrides.id,
  };
}

export function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: "Task",
    description: "",
    updates: "",
    updateEntries: [],
    comments: [],
    assigneeIds: [],
    assigneeDepartmentIds: [],
    finishedByIds: [],
    feedbackByIds: [],
    feedbackRequests: [],
    assignedById: "founder-1",
    status: "todo",
    priority: "medium",
    dueDate: new Date().toISOString(),
    originalDueDate: new Date().toISOString(),
    postponeCount: 0,
    needsFeedback: false,
    createdAt: new Date().toISOString(),
    ...overrides,
    id: overrides.id,
  };
}

export function makeAppointment(overrides: Partial<Appointment> & Pick<Appointment, "id">): Appointment {
  return {
    title: "Meeting",
    location: "",
    startsAt: new Date().toISOString(),
    participantIds: [],
    participantDepartmentIds: [],
    createdById: "founder-1",
    status: "scheduled",
    createdAt: new Date().toISOString(),
    ...overrides,
    id: overrides.id,
  };
}

export function makeReminder(overrides: Partial<PersonalReminder> & Pick<PersonalReminder, "id">): PersonalReminder {
  return {
    ownerId: "founder-1",
    title: "Reminder",
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    notes: "",
    done: false,
    createdAt: new Date().toISOString(),
    participantIds: [],
    participantDepartmentIds: [],
    ...overrides,
    id: overrides.id,
  };
}
