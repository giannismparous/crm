import { describe, expect, it } from "vitest";
import {
  applyFirestoreListIfChanged,
  firestoreDocListVersion,
  firestoreListFingerprint,
  personFirestoreListVersion,
} from "./firestoreListSync";

describe("firestoreListSync", () => {
  it("skips apply when fingerprint is unchanged", () => {
    const ref = { current: "" };
    let calls = 0;
    const list = [{ id: "a", updatedAt: "1" }];
    applyFirestoreListIfChanged(ref, list, (i) => (i as { updatedAt: string }).updatedAt, () => {
      calls += 1;
    });
    expect(calls).toBe(1);
    applyFirestoreListIfChanged(ref, list, (i) => (i as { updatedAt: string }).updatedAt, () => {
      calls += 1;
    });
    expect(calls).toBe(1);
  });

  it("uses fallback fields when updatedAt is missing", () => {
    expect(firestoreDocListVersion({ status: "done", dueDate: "2026-01-01" })).toBe("done|2026-01-01|||||");
  });

  it("orders fingerprint by id", () => {
    const fp = firestoreListFingerprint(
      [
        { id: "b", updatedAt: "2" },
        { id: "a", updatedAt: "1" },
      ] as Array<{ id: string; updatedAt: string }>,
      (i) => i.updatedAt
    );
    expect(fp).toBe("a:1|b:2");
  });

  it("detects team directory name changes without updatedAt", () => {
    const before = personFirestoreListVersion({ name: "pantelosni", title: "", departments: ["Marketing"] });
    const after = personFirestoreListVersion({ name: "Παντελής", title: "", departments: ["Marketing"] });
    expect(before).not.toBe(after);
  });
});
