import { describe, expect, it } from "vitest";
import { reminderDueNotificationId, REMINDER_DUE_OFFSETS } from "../../src/utils/reminderDueNotifications";

describe("reminder due notification dedup keys", () => {
  it("uses stable ids per reminder/recipient", () => {
    expect(reminderDueNotificationId("r1", "u1")).toBe("r1_due_u1");
    expect(reminderDueNotificationId("r1", "u2")).toBe("r1_due_u2");
  });

  it("defines four dedup slot keys", () => {
    expect(REMINDER_DUE_OFFSETS.map((o) => o.key)).toEqual(["1d", "6h", "2h", "30m"]);
  });
});
