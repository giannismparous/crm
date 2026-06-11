import { describe, expect, it, beforeEach } from "vitest";
import {
  datetimeLocalToIsoInZone,
  isoFromOrgSystemWall,
  orgYmdAddDays,
  orgYmdAddMonths,
  ORG_TIMEZONE,
  wallTimeAtOrgSystem,
} from "./orgTimezone";
import { ORG_TIMEZONE as USER_ORG_TZ } from "./userTimezone";

describe("orgTimezone", () => {
  beforeEach(() => {
    expect(ORG_TIMEZONE).toBe("Europe/Athens");
    expect(USER_ORG_TZ).toBe("Europe/Athens");
  });

  it("converts org wall time to UTC ISO", () => {
    const iso = isoFromOrgSystemWall({ year: 2024, month: 6, day: 15, hour: 10, minute: 30 });
    const wall = wallTimeAtOrgSystem(new Date(iso).getTime());
    expect(wall).toMatchObject({ year: 2024, month: 6, day: 15, hour: 10, minute: 30 });
  });

  it("parses datetime-local in a timezone", () => {
    const iso = datetimeLocalToIsoInZone("2024-06-15T10:30", ORG_TIMEZONE);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const wall = wallTimeAtOrgSystem(new Date(iso).getTime());
    expect(wall?.hour).toBe(10);
    expect(wall?.minute).toBe(30);
  });

  it("adds calendar days in org timezone", () => {
    const next = orgYmdAddDays(2024, 2, 28, 1, ORG_TIMEZONE);
    expect(next).toEqual({ year: 2024, monthIndex: 2, day: 29 });
  });

  it("clamps monthly day on shorter months", () => {
    const next = orgYmdAddMonths(2024, 0, 31, 1, ORG_TIMEZONE);
    expect(next.monthIndex).toBe(1);
    expect(next.day).toBe(29); // Feb 2024 leap year
  });
});
