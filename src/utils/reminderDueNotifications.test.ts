import { describe, expect, it } from "vitest";
import {
  reminderDueNotificationId,
  recipientsForReminderDue,
  REMINDER_DUE_OFFSETS,
} from "./reminderDueNotifications";
import { makePerson, makeReminder } from "../../tests/helpers/fixtures";

describe("reminderDueNotifications", () => {
  it("defines four due offsets", () => {
    expect(REMINDER_DUE_OFFSETS.map((o) => o.key)).toEqual(["1d", "6h", "2h", "30m"]);
  });

  it("builds stable notification ids", () => {
    expect(reminderDueNotificationId("r1", "u1")).toBe("r1_due_u1");
  });

  it("includes owner and expanded participants", () => {
    const people = [
      makePerson({ id: "owner", departments: ["Engineering"] }),
      makePerson({ id: "peer", departments: ["Engineering"] }),
    ];
    const reminder = makeReminder({
      id: "r1",
      ownerId: "owner",
      participantIds: [],
      participantDepartmentIds: ["Engineering"],
    });
    const ids = recipientsForReminderDue(reminder, people);
    expect(ids.sort()).toEqual(["owner", "peer"]);
  });
});
