import { describe, expect, it } from "vitest";
import {
  buildGoogleRecurrenceRRule,
  crmAppointmentCanceledExdateStartsAt,
  crmTaskSkippedExdateKeys,
  expandCrmAppointmentOccurrences,
  expandCrmTaskOccurrences,
  googleRecurrenceLines,
  googleRecurrenceLinesForDateTime,
} from "./recurrenceRrule";

describe("recurrenceRrule", () => {
  it("builds weekly COUNT rule", () => {
    expect(buildGoogleRecurrenceRRule({ kind: "weekly", interval: 1 }, 12)).toBe(
      "FREQ=WEEKLY;COUNT=12"
    );
  });

  it("builds monthly BYMONTHDAY rule", () => {
    expect(buildGoogleRecurrenceRRule({ kind: "monthly_day", interval: 1, dayOfMonth: 15 }, 6)).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=6"
    );
  });

  it("uses UNTIL when truncating", () => {
    const lines = googleRecurrenceLines(
      { kind: "weekly", interval: 1 },
      12,
      "2024-06-10T09:00:00.000Z"
    );
    expect(lines[0]).toMatch(/^RRULE:FREQ=WEEKLY;UNTIL=/);
    expect(lines[0]).not.toContain("COUNT=");
  });

  it("adds EXDATE for canceled task occurrences", () => {
    const keys = crmTaskSkippedExdateKeys({
      dueDate: "2026-06-01",
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceOngoing: true,
      canceledOccurrenceIndices: [1],
      completedOccurrenceIndices: [2],
    });
    expect(keys.length).toBe(2);
    const lines = googleRecurrenceLines({ kind: "weekly", interval: 1 }, 8, undefined, keys);
    expect(lines.some((l) => l.startsWith("EXDATE;VALUE=DATE:"))).toBe(true);
  });

  it("filters canceled appointment occurrences from active expand", () => {
    const active = expandCrmAppointmentOccurrences({
      startsAt: "2026-06-01T10:00:00.000+03:00",
      endsAt: "2026-06-01T11:00:00.000+03:00",
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 4,
      canceledOccurrenceIndices: [1],
    });
    expect(active.length).toBe(3);
  });

  it("builds datetime EXDATE for canceled meetings", () => {
    const exdates = crmAppointmentCanceledExdateStartsAt({
      startsAt: "2026-06-01T10:00:00.000+03:00",
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 4,
      canceledOccurrenceIndices: [1],
    });
    expect(exdates.length).toBe(1);
    const lines = googleRecurrenceLinesForDateTime(
      { kind: "weekly", interval: 1 },
      4,
      undefined,
      exdates
    );
    expect(lines.some((l) => l.startsWith("EXDATE;TZID="))).toBe(true);
  });

  it("filters completed task occurrences from calendar expand", () => {
    const active = expandCrmTaskOccurrences({
      dueDate: "2026-06-01",
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 4,
      completedOccurrenceIndices: [0],
    });
    expect(active.length).toBe(3);
    expect(active.every((o) => o.index !== 0)).toBe(true);
  });
});
