import { describe, expect, it } from "vitest";
import {
  appointmentVisibleToViewer,
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

  it("partner sees dept project and dept task", () => {
    const project = makeProject({ id: "pr1", departmentIds: ["Engineering"] });
    const task = makeTask({ id: "t1", assigneeDepartmentIds: ["Engineering"] });
    expect(projectVisibleToViewer(project, engPartner, "partner")).toBe(true);
    expect(taskVisibleToViewer(task, engPartner, "p1", people, [project], "partner")).toBe(true);
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

  it("partner sees same-dept people only", () => {
    expect(personVisibleToViewer(engPartner, engPartner, "partner")).toBe(true);
    expect(personVisibleToViewer(salesPartner, engPartner, "partner")).toBe(false);
    expect(personVisibleToViewer(salesPartner, founder, "founder")).toBe(true);
  });

  it("appointment visibility follows participation", () => {
    const apt = makeAppointment({ id: "a1", participantIds: ["p1"] });
    expect(appointmentVisibleToViewer(apt, "p1", people, "partner")).toBe(true);
    expect(appointmentVisibleToViewer(apt, "p2", people, "partner")).toBe(false);
  });
});
