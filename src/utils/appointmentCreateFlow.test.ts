import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_CREATE_PHASES,
  partnerRollbackMayLeaveCanceledDocs,
} from "./appointmentCreateFlow";

describe("appointmentCreateFlow", () => {
  it("documents commit phases in order", () => {
    expect(APPOINTMENT_CREATE_PHASES[0]).toBe("validate");
    expect(APPOINTMENT_CREATE_PHASES.at(-1)).toBe("notify_and_sync");
  });

  it("partner rollback may leave canceled docs after any write phase", () => {
    expect(partnerRollbackMayLeaveCanceledDocs("validate")).toBe(false);
    expect(partnerRollbackMayLeaveCanceledDocs("create_tasks")).toBe(true);
    expect(partnerRollbackMayLeaveCanceledDocs("link_tasks")).toBe(true);
  });
});
