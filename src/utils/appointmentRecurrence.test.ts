import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECURRENCE_COUNT,
  generateRecurrenceOccurrences,
  MAX_RECURRENCE_COUNT,
  MIN_RECURRENCE_COUNT,
  normalizeRecurrenceCount,
  occurrenceStartsAt,
} from "./appointmentRecurrence";

describe("appointmentRecurrence", () => {
  it("clamps count between 2 and 52", () => {
    expect(MIN_RECURRENCE_COUNT).toBe(2);
    expect(MAX_RECURRENCE_COUNT).toBe(52);
    expect(normalizeRecurrenceCount(1)).toBe(2);
    expect(normalizeRecurrenceCount(100)).toBe(52);
    expect(normalizeRecurrenceCount(undefined)).toBe(DEFAULT_RECURRENCE_COUNT);
  });

  it("generates weekly occurrences in org timezone", () => {
    const first = "2024-03-04T08:00:00.000Z"; // Monday morning UTC, org wall time stable
    const rule = { kind: "weekly" as const, interval: 1 };
    const occ = generateRecurrenceOccurrences(first, undefined, rule, 3);
    expect(occ).toHaveLength(3);
    expect(occ[0]!.startsAt).toBe(first);
    expect(new Date(occ[1]!.startsAt).getTime()).toBeGreaterThan(new Date(occ[0]!.startsAt).getTime());
    expect(new Date(occ[2]!.startsAt).getTime()).toBeGreaterThan(new Date(occ[1]!.startsAt).getTime());
  });

  it("preserves duration across occurrences", () => {
    const first = "2024-03-04T08:00:00.000Z";
    const end = "2024-03-04T09:30:00.000Z";
    const occ = generateRecurrenceOccurrences(first, end, { kind: "daily", interval: 1 }, 2);
    const duration = new Date(occ[0]!.endsAt!).getTime() - new Date(occ[0]!.startsAt).getTime();
    const duration2 = new Date(occ[1]!.endsAt!).getTime() - new Date(occ[1]!.startsAt).getTime();
    expect(duration).toBe(90 * 60 * 1000);
    expect(duration2).toBe(duration);
  });

  it("handles DST spring forward for daily recurrence", () => {
    // Last Sunday of March 2024 in Europe/Athens — DST starts
    const first = "2024-03-25T06:00:00.000Z";
    const second = occurrenceStartsAt(first, { kind: "daily", interval: 1 }, 1);
    expect(second).not.toBe(first);
    expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime());
  });
});
