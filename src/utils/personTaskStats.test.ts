import { describe, expect, it } from "vitest";
import {
  computePersonStatDeltas,
  EMPTY_PERSON_TASK_STATS,
  isTaskOpen,
  normalizePersonTaskStats,
  statDeltaForNewTask,
} from "./personTaskStats";
import { makePerson, makeTask } from "../../tests/helpers/fixtures";

describe("personTaskStats", () => {
  const people = [makePerson({ id: "w1", departments: ["Engineering"] })];

  it("normalizes stats object", () => {
    expect(normalizePersonTaskStats(null)).toEqual(EMPTY_PERSON_TASK_STATS);
    expect(normalizePersonTaskStats({ tasksCompleted: 3, tasksAssigned: "2" })).toMatchObject({
      tasksCompleted: 3,
      tasksAssigned: 2,
    });
  });

  it("tracks completion delta for assignees", () => {
    const before = makeTask({ id: "t1", status: "review", assigneeIds: ["w1"] });
    const after = makeTask({ id: "t1", status: "done", assigneeIds: ["w1"] });
    const deltas = computePersonStatDeltas(before, after, people, { intent: "mark_complete" });
    expect(deltas.get("w1")).toMatchObject({ tasksCompleted: 1, tasksFinishedMarked: 1 });
  });

  it("statDeltaForNewTask credits assigner", () => {
    const deltas = statDeltaForNewTask("creator");
    expect(deltas.get("creator")).toEqual({ tasksAssigned: 1 });
  });

  it("isTaskOpen excludes done and canceled", () => {
    expect(isTaskOpen(makeTask({ id: "t1", status: "todo" }))).toBe(true);
    expect(isTaskOpen(makeTask({ id: "t1", status: "done" }))).toBe(false);
    expect(isTaskOpen(makeTask({ id: "t1", status: "canceled" }))).toBe(false);
  });
});
