import { describe, expect, it } from "vitest";
import { buildGoogleRecurrenceRRule, googleRecurrenceLines } from "./recurrenceRrule";

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
});
