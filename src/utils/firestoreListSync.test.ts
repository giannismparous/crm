import { describe, expect, it } from "vitest";
import { applyFirestoreListIfChanged, firestoreListFingerprint } from "./firestoreListSync";

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
});
