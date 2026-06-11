import { describe, expect, it } from "vitest";
import {
  appointmentVisibleToViewer,
  canAccessContacts,
  departmentsOverlap,
  personVisibleToViewer,
  projectVisibleToViewer,
  taskVisibleToViewer,
} from "./orgVisibility";
import { makeAppointment, makePerson, makeProject, makeTask } from "../../tests/helpers/fixtures";

describe("orgVisibility", () => {
  const founder = makePerson({ id: "f1", orgRole: "founder", departments: [] });
  const engPartner = makePerson({ id: "p1", orgRole: "partner", departments: ["Engineering"] });
  const salesPartner = makePerson({ id: "p2", orgRole: "partner", departments: ["Sales"] });
  const people = [founder, engPartner, salesPartner];

  it("departmentsOverlap requires both sides non-empty", () => {
    expect(departmentsOverlap(["Engineering"], ["Engineering"])).toBe(true);
    expect(departmentsOverlap([], ["Engineering"])).toBe(false);
  });

  it("founder sees all projects and tasks", () => {
    const project = makeProject({ id: "pr1", departmentIds: ["Sales"] });
    const task = makeTask({ id: "t1", assigneeDepartmentIds: ["Sales"] });
    expect(projectVisibleToViewer(project, engPartner, "founder")).toBe(true);
    expect(taskVisibleToViewer(task, engPartner, "f1", people, [project], "founder")).toBe(true);
  });

  it("partner sees org-wide and own-dept projects", () => {
    const orgProject = makeProject({ id: "pr0", departmentIds: [] });
    const generalProject = makeProject({ id: "prG", departmentIds: ["General"] });
    const engProject = makeProject({ id: "pr1", departmentIds: ["Engineering"] });
    const salesProject = makeProject({ id: "pr2", departmentIds: ["Sales"] });
    expect(projectVisibleToViewer(orgProject, salesPartner, "partner")).toBe(true);
    expect(projectVisibleToViewer(generalProject, engPartner, "partner")).toBe(true);
    expect(projectVisibleToViewer(engProject, engPartner, "partner")).toBe(true);
    expect(projectVisibleToViewer(salesProject, engPartner, "partner")).toBe(false);
    const task = makeTask({ id: "t1", assigneeDepartmentIds: ["Engineering"] });
    expect(taskVisibleToViewer(task, engPartner, "p1", people, [engProject], "partner")).toBe(true);
  });

  it("partner does not see unrelated dept task", () => {
    const project = makeProject({ id: "pr1", departmentIds: ["Sales"] });
    const task = makeTask({ id: "t1", assigneeDepartmentIds: ["Sales"] });
    expect(taskVisibleToViewer(task, engPartner, "p1", people, [project], "partner")).toBe(false);
  });

  it("partner sees task in visible project even if dept differs", () => {
    const project = makeProject({ id: "pr1", departmentIds: ["Engineering"] });
    const task = makeTask({ id: "t1", projectId: "pr1", assigneeDepartmentIds: ["Sales"] });
    expect(taskVisibleToViewer(task, engPartner, "p1", people, [project], "partner")).toBe(true);
  });

  it("partner sees org-wide General and open tasks without a project", () => {
    const general = makeTask({ id: "tG", assigneeDepartmentIds: ["General"] });
    const open = makeTask({ id: "tO", assigneeIds: [], assigneeDepartmentIds: [] });
    expect(taskVisibleToViewer(general, engPartner, "p1", people, [], "partner")).toBe(true);
    expect(taskVisibleToViewer(general, salesPartner, "p2", people, [], "partner")).toBe(true);
    expect(taskVisibleToViewer(open, engPartner, "p1", people, [], "partner")).toBe(true);
  });

  it("partner does not see org-wide task inside another department project", () => {
    const salesProject = makeProject({ id: "prS", departmentIds: ["Sales"] });
    const generalInSales = makeTask({
      id: "t1",
      projectId: "prS",
      assigneeDepartmentIds: ["General"],
    });
    expect(taskVisibleToViewer(generalInSales, engPartner, "p1", people, [salesProject], "partner")).toBe(
      false
    );
  });

  it("partners see all teammates in the org directory", () => {
    expect(personVisibleToViewer(engPartner, engPartner, "partner")).toBe(true);
    expect(personVisibleToViewer(salesPartner, engPartner, "partner")).toBe(true);
    expect(personVisibleToViewer(salesPartner, founder, "founder")).toBe(true);
  });

  it("contacts access is founders and Sales partners only", () => {
    expect(canAccessContacts(founder, "founder")).toBe(true);
    expect(canAccessContacts(salesPartner, "partner")).toBe(true);
    expect(canAccessContacts(engPartner, "partner")).toBe(false);
  });

  it("partner task visibility is the same for completed and open", () => {
    const project = makeProject({ id: "pr1", departmentIds: ["Engineering"] });
    const open = makeTask({ id: "t1", assigneeDepartmentIds: ["Engineering"], status: "todo" });
    const done = makeTask({
      id: "t2",
      assigneeDepartmentIds: ["Engineering"],
      status: "done",
      completedAt: new Date().toISOString(),
    });
    const hidden = makeTask({ id: "t3", assigneeDepartmentIds: ["Sales"], status: "done" });
    expect(taskVisibleToViewer(open, engPartner, "p1", people, [project], "partner")).toBe(true);
    expect(taskVisibleToViewer(done, engPartner, "p1", people, [project], "partner")).toBe(true);
    expect(taskVisibleToViewer(hidden, engPartner, "p1", people, [project], "partner")).toBe(false);
  });

  it("appointment visibility follows participation", () => {
    const apt = makeAppointment({ id: "a1", participantIds: ["p1"] });
    expect(appointmentVisibleToViewer(apt, "p1", people, "partner")).toBe(true);
    expect(appointmentVisibleToViewer(apt, "p2", people, "partner")).toBe(false);
  });
});
