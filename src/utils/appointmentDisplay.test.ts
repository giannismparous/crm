import { describe, expect, it } from "vitest";
import type { Appointment } from "../types";
import {
  appointmentMatchesListTab,
  appointmentsForListView,
  isRecurringAppointment,
  listDisplayOccurrence,
} from "./appointmentDisplay";

function baseApt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "a1",
    title: "Standup",
    startsAt: "2030-06-03T07:00:00.000Z",
    location: "",
    participantIds: [],
    participantDepartmentIds: [],
    createdById: "u1",
    status: "scheduled",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("appointmentDisplay", () => {
  it("treats single-doc recurrence as one list item", () => {
    const apt = baseApt({
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 12,
    });
    expect(isRecurringAppointment(apt)).toBe(true);
    expect(appointmentsForListView([apt])).toHaveLength(1);
  });

  it("hides legacy materialized siblings in the list", () => {
    const seriesId = "legacy-series";
    const master = baseApt({
      id: "m",
      recurrenceSeriesId: seriesId,
      recurrenceIndex: 0,
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 3,
    });
    const sibling = baseApt({
      id: "s",
      recurrenceSeriesId: seriesId,
      recurrenceIndex: 1,
      startsAt: "2030-06-10T07:00:00.000Z",
    });
    expect(appointmentsForListView([master, sibling])).toEqual([master]);
  });

  it("shows next upcoming occurrence in list display", () => {
    const apt = baseApt({
      startsAt: "2030-06-15T07:00:00.000Z",
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 12,
    });
    const now = new Date("2030-06-01T12:00:00.000Z").getTime();
    const occ = listDisplayOccurrence(apt, now);
    expect(new Date(occ.startsAt).getTime()).toBeGreaterThan(now);
    expect(occ.startsAt).toBe("2030-06-15T07:00:00.000Z");
  });

  it("moves canceled recurring series to canceled tab and drops upcoming", () => {
    const apt = baseApt({
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 12,
      status: "canceled",
      recurrenceCanceledFrom: "2030-06-01T12:00:00.000Z",
    });
    const now = new Date("2030-06-01T12:00:00.000Z").getTime();
    expect(appointmentMatchesListTab(apt, "canceled", now)).toBe(true);
    expect(appointmentMatchesListTab(apt, "upcoming", now)).toBe(false);
  });
});
