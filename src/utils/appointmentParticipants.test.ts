import { describe, expect, it } from "vitest";
import {
  appointmentAttendeeIds,
  normalizeAppointmentParticipants,
  participantIdsCoveredByDepartments,
} from "./appointmentParticipants";
import { makePerson } from "../../tests/helpers/fixtures";

describe("appointmentParticipants", () => {
  const people = [
    makePerson({ id: "a", departments: ["Engineering"] }),
    makePerson({ id: "b", departments: ["Engineering"] }),
    makePerson({ id: "c", departments: ["Sales"] }),
  ];

  it("marks department-covered individuals", () => {
    const covered = participantIdsCoveredByDepartments(people, ["Engineering"]);
    expect(covered.has("a")).toBe(true);
    expect(covered.has("b")).toBe(true);
    expect(covered.has("c")).toBe(false);
  });

  it("dedupes individuals covered by departments", () => {
    const result = normalizeAppointmentParticipants(people, ["a", "b"], ["Engineering"]);
    expect(result.participantIds).toEqual([]);
    expect(result.participantDepartmentIds).toEqual(["Engineering"]);
  });

  it("keeps explicit individuals not covered by dept", () => {
    const result = normalizeAppointmentParticipants(people, ["c"], ["Engineering"]);
    expect(result.participantIds).toEqual(["c"]);
  });

  it("expands attendee ids from departments", () => {
    const ids = appointmentAttendeeIds(
      { participantIds: ["c"], participantDepartmentIds: ["Engineering"] },
      people
    );
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });
});
