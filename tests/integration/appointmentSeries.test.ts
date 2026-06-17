import { describe, expect, it, afterEach } from "vitest";
import { adminDb, ORG, resetEmulatorData } from "../helpers/emulatorAdmin";

const emulatorUp = process.env.VITEST_EMULATOR_UP === "1";
const allowSkip = process.env.CRM_TEST_ALLOW_SKIP === "1";

describe.skipIf(!emulatorUp && allowSkip)("recurring appointment (single Firestore doc)", () => {
  afterEach(async () => {
    await resetEmulatorData();
  });

  it("stores one doc with recurrenceRule and recurrenceCount", async () => {
    const db = adminDb();
    const col = db.collection("organizations").doc(ORG).collection("appointments");
    const ref = col.doc();
    await ref.set({
      title: "Weekly",
      startsAt: "2024-06-03T07:00:00.000Z",
      participantIds: [],
      createdById: "founder-1",
      status: "scheduled",
      createdAt: new Date().toISOString(),
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 12,
    });

    const snap = await col.get();
    expect(snap.size).toBe(1);
    const data = snap.docs[0]!.data();
    expect(data.recurrenceRule).toEqual({ kind: "weekly", interval: 1 });
    expect(data.recurrenceCount).toBe(12);
    expect(data.recurrenceSeriesId).toBeUndefined();
  });

  it("truncates series with recurrenceCanceledFrom", async () => {
    const db = adminDb();
    const ref = db.collection("organizations").doc(ORG).collection("appointments").doc();
    await ref.set({
      title: "Weekly",
      startsAt: "2024-06-03T07:00:00.000Z",
      participantIds: [],
      createdById: "founder-1",
      status: "canceled",
      createdAt: new Date().toISOString(),
      recurrenceRule: { kind: "weekly", interval: 1 },
      recurrenceCount: 12,
      recurrenceCanceledFrom: "2024-06-20T07:00:00.000Z",
      canceledAt: "2024-06-20T07:00:00.000Z",
    });

    const data = (await ref.get()).data();
    expect(data?.recurrenceCanceledFrom).toBe("2024-06-20T07:00:00.000Z");
  });
});
