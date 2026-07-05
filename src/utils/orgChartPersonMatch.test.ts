import { describe, expect, it } from "vitest";
import type { Person } from "../types";
import { orgChartDisplayLabel, personNameKey, resolveOrgChartPerson, splitOrgChartNameList } from "./orgChartPersonMatch";

function person(partial: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return {
    title: "",
    email: "",
    departments: [],
    orgRole: "partner",
    ...partial,
  };
}

const TEAM: Person[] = [
  person({
    id: "p1",
    name: "Στέργιος Χατζηκυριακίδης",
    orgRole: "founder",
    departments: ["Product"],
  }),
  person({
    id: "p2",
    name: "Δημήτρης Παπαδάκης",
    orgRole: "founder",
    departments: ["Sales", "Operations"],
  }),
  person({
    id: "p3",
    name: "Giannis Mparous",
    email: "giannismparous@gmail.com",
    orgRole: "founder",
    departments: ["Product", "Engineering"],
  }),
  person({
    id: "p4",
    name: "Χαρά Παπαδοπούλου",
    orgRole: "founder",
    departments: ["Marketing"],
  }),
  person({
    id: "p5",
    name: "Αναστασία Κωνσταντίνου",
    orgRole: "founder",
    departments: ["Marketing"],
  }),
  person({ id: "p6", name: "Στέφανος Αλεξίου", departments: ["Sales"] }),
  person({ id: "p7", name: "Έλενα Δημητρίου", departments: ["Marketing"] }),
  person({
    id: "p8",
    name: "Pantelis",
    email: "pantelosni@gmail.com",
    departments: ["Marketing"],
  }),
];

describe("orgChartPersonMatch", () => {
  it("normalizes greek and latin first names to the same key", () => {
    expect(personNameKey("Γιάννης")).toBe(personNameKey("Giannis"));
    expect(personNameKey("Στέργιος")).toBe(personNameKey("Stergios"));
  });

  it("matches greek chart labels to latin directory names", () => {
    expect(resolveOrgChartPerson("Γιάννης", TEAM)?.id).toBe("p3");
    expect(resolveOrgChartPerson("Στέργιος", TEAM, { preferFounder: true })?.id).toBe("p1");
    expect(resolveOrgChartPerson("Δημήτρης", TEAM, { departmentHint: "Sales" })?.id).toBe("p2");
  });

  it("splits multi-name strings", () => {
    expect(splitOrgChartNameList("Δημήτρης & Αναστασία")).toEqual(["Δημήτρης", "Αναστασία"]);
  });

  it("ignores non-person labels", () => {
    expect(resolveOrgChartPerson("Content Creator", TEAM)).toBeUndefined();
  });

  it("matches marketing content creator by first name", () => {
    expect(resolveOrgChartPerson("Pantelis", TEAM, { departmentHint: "Marketing" })?.id).toBe("p8");
    expect(resolveOrgChartPerson("Παντελής", TEAM, { departmentHint: "Marketing" })?.id).toBe("p8");
  });

  it("uses live directory first name for linked members", () => {
    expect(orgChartDisplayLabel("Pantelis", TEAM[7])).toBe("Pantelis");
    expect(orgChartDisplayLabel("Pantelis", { ...TEAM[7]!, name: "Pantelis Nikolaidis" })).toBe("Pantelis");
  });
});
