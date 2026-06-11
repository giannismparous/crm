import { describe, expect, it } from "vitest";
import { groupDepartmentsFromPeople, groupKeyForSelection, resolveGroupMemberIds } from "./chatGroup";
import { makePerson } from "../../tests/helpers/fixtures";

describe("chatGroup", () => {
  const people = [
    makePerson({ id: "a", departments: ["Engineering"] }),
    makePerson({ id: "b", departments: ["Engineering", "Sales"] }),
    makePerson({ id: "c", departments: ["Sales"] }),
  ];

  it("builds stable group keys", () => {
    expect(groupKeyForSelection(["b", "a"], ["Sales"], "creator")).toBe("p:a,b|d:Sales");
    expect(groupKeyForSelection(["b", "a"], ["Sales"], "creator")).toBe(
      groupKeyForSelection(["a", "b"], ["Sales"], "creator")
    );
  });

  it("excludes creator from group key people segment", () => {
    expect(groupKeyForSelection(["creator", "b"], [], "creator")).toBe("p:b|d:");
  });

  it("resolves group members from people and departments", () => {
    const members = resolveGroupMemberIds("creator", ["c"], ["Engineering"], people);
    expect(members).toEqual(["a", "b", "c", "creator"].sort());
  });

  it("collects departments from allowed members", () => {
    const allowed = new Set(["a", "b"]);
    expect(groupDepartmentsFromPeople(people, allowed)).toEqual(["Engineering", "Sales"]);
  });
});
