import { describe, expect, it } from "vitest";
import {
  everyoneElsePersonIds,
  recipientIdsFromSelection,
  recipientsForNewTask,
  taskFinishedNotifyRecipients,
} from "./notifyRecipients";
import { makePerson, makeTask } from "../../tests/helpers/fixtures";

describe("notifyRecipients", () => {
  const people = [
    makePerson({ id: "creator", departments: ["Engineering"] }),
    makePerson({ id: "worker", departments: ["Engineering"] }),
    makePerson({ id: "other", departments: ["Sales"] }),
  ];

  it("resolves recipients from people and departments", () => {
    const ids = recipientIdsFromSelection(people, ["other"], ["Engineering"], ["creator"]);
    expect(ids.sort()).toEqual(["other", "worker"]);
  });

  it("everyoneElse excludes actor", () => {
    expect(everyoneElsePersonIds(people, "creator").sort()).toEqual(["other", "worker"]);
  });

  it("recipientsForNewTask excludes creator", () => {
    const task = makeTask({
      id: "t1",
      assignedById: "creator",
      assigneeIds: ["worker"],
      assigneeDepartmentIds: ["Engineering"],
    });
    expect(recipientsForNewTask(task, people, "creator")).toEqual(["worker"]);
  });

  it("taskFinishedNotifyRecipients assigns roles", () => {
    const task = makeTask({
      id: "t1",
      assignedById: "creator",
      assigneeIds: ["worker"],
    });
    const rows = taskFinishedNotifyRecipients(task, "worker", people);
    const creatorRow = rows.find((r) => r.recipientId === "creator");
    expect(creatorRow?.role).toBe("assigner");
  });
});
