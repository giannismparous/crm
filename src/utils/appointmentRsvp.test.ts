import { describe, expect, it, vi } from "vitest";
import type { Appointment } from "../types";
import {
  buildRsvpPatch,
  firstSelectableOccurrenceIndex,
  getOccurrenceRsvpAnswer,
  normalizeOccurrenceRsvp,
  selectableOccurrences,
  sortedAppointmentAttendees,
} from "./appointmentRsvp";
import { orgDateKey, orgTodayDateKey } from "./orgTimezone";

function baseApt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "a1",
    title: "Sync",
    startsAt: "2030-06-01T10:00:00.000Z",
    location: "",
    participantIds: ["p1", "p2"],
    participantDepartmentIds: [],
    createdById: "creator",
    status: "scheduled",
    createdAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("appointmentRsvp", () => {
  it("normalizes occurrence RSVP map", () => {
    expect(
      normalizeOccurrenceRsvp({
        "0": { p1: "yes", p2: "no", bad: "maybe" },
        "1": { p1: "no" },
      })
    ).toEqual({
      "0": { p1: "yes", p2: "no" },
      "1": { p1: "no" },
    });
  });

  it("returns pending when no answer", () => {
    const apt = baseApt({ occurrenceRsvp: { "0": { p1: "yes" } } });
    expect(getOccurrenceRsvpAnswer(apt, 0, "p1")).toBe("yes");
    expect(getOccurrenceRsvpAnswer(apt, 0, "p2")).toBe("pending");
    expect(getOccurrenceRsvpAnswer(apt, 1, "p1")).toBe("pending");
  });

  it("builds merged RSVP patch per occurrence", () => {
    const apt = baseApt({
      occurrenceRsvp: {
        "0": { p1: "yes" },
        "1": { p2: "no" },
      },
    });
    expect(buildRsvpPatch(apt, 0, "p2", "no")).toEqual({
      occurrenceRsvp: {
        "0": { p1: "yes", p2: "no" },
        "1": { p2: "no" },
      },
    });
  });

  it("lists direct participants as attendees", () => {
    const people = [
      { id: "p1", name: "Alice", title: "", email: "", departments: [], orgRole: "partner" as const },
      { id: "p2", name: "Bob", title: "", email: "", departments: [], orgRole: "partner" as const },
    ];
    expect(sortedAppointmentAttendees(baseApt(), people).map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("selectableOccurrences omits dates before today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"));
    const apt = baseApt({
      startsAt: "2026-06-01T10:00:00.000Z",
      endsAt: "2026-06-01T11:00:00.000Z",
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 6,
    });
    const selectable = selectableOccurrences(apt);
    const todayKey = orgTodayDateKey();
    expect(selectable.every((o) => orgDateKey(o.startsAt) >= todayKey)).toBe(true);
    expect(selectable.length).toBeLessThan(6);
    expect(selectable.length).toBeGreaterThan(0);
    expect(firstSelectableOccurrenceIndex(apt)).toBe(selectable[0]!.index);
    vi.useRealTimers();
  });
});
