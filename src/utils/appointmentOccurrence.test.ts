// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isOccurrencePast,
  rsvpPromptOccurrence,
  computeOngoingRecurrenceCount,
} from "./appointmentOccurrence";
import type { AppointmentRecurrenceRule } from "./appointmentRecurrence";

const weeklyRule: AppointmentRecurrenceRule = { kind: "weekly", interval: 1 };

describe("appointmentOccurrence", () => {
  it("isOccurrencePast uses endsAt when present", () => {
    const occ = {
      startsAt: "2026-06-01T10:00:00.000Z",
      endsAt: "2026-06-01T11:00:00.000Z",
    };
    expect(isOccurrencePast(occ, new Date("2026-06-01T11:00:01.000Z").getTime())).toBe(true);
    expect(isOccurrencePast(occ, new Date("2026-06-01T10:30:00.000Z").getTime())).toBe(false);
  });

  it("rsvpPromptOccurrence waits until previous occurrence ends", () => {
    const occurrences = [
      { index: 0, startsAt: "2026-06-01T10:00:00.000Z", endsAt: "2026-06-01T11:00:00.000Z" },
      { index: 1, startsAt: "2026-06-08T10:00:00.000Z", endsAt: "2026-06-08T11:00:00.000Z" },
    ];
    expect(
      rsvpPromptOccurrence(occurrences, new Date("2026-06-01T10:30:00.000Z").getTime())?.index
    ).toBe(0);
    expect(
      rsvpPromptOccurrence(occurrences, new Date("2026-06-01T11:05:00.000Z").getTime())?.index
    ).toBe(1);
  });

  it("computeOngoingRecurrenceCount generates a rolling window", () => {
    const first = "2026-01-01T10:00:00.000Z";
    const now = new Date("2026-02-01T10:00:00.000Z").getTime();
    const count = computeOngoingRecurrenceCount(first, weeklyRule, now);
    expect(count).toBeGreaterThan(4);
    expect(count).toBeLessThan(20);
  });
});
