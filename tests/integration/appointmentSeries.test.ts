import { describe, expect, it, afterEach } from "vitest";
import { generateRecurrenceOccurrences } from "../../src/utils/appointmentRecurrence";
import { adminDb, ORG, resetEmulatorData } from "../helpers/emulatorAdmin";

const emulatorUp = process.env.VITEST_EMULATOR_UP === "1";
const allowSkip = process.env.CRM_TEST_ALLOW_SKIP === "1";

describe.skipIf(!emulatorUp && allowSkip)("appointment series materialization", () => {
  afterEach(async () => {
    await resetEmulatorData();
  });

  it("creates 12 weekly docs with shared series id and indices", async () => {
    const seriesId = "series-weekly-12";
    const first = "2024-06-03T07:00:00.000Z";
    const occ = generateRecurrenceOccurrences(first, undefined, { kind: "weekly", interval: 1 }, 12);
    expect(occ).toHaveLength(12);

    const db = adminDb();
    const col = db.collection("organizations").doc(ORG).collection("appointments");
    const batch = db.batch();
    const ids: string[] = [];
    occ.forEach((o, i) => {
      const ref = col.doc();
      ids.push(ref.id);
      batch.set(ref, {
        title: "Weekly",
        startsAt: o.startsAt,
        participantIds: [],
        createdById: "founder-1",
        status: "scheduled",
        createdAt: new Date().toISOString(),
        recurrenceSeriesId: seriesId,
        recurrenceIndex: i,
        recurrenceCount: 12,
        description:
          i === 0
            ? '<img class="task-inline-image" data-storage-path="organizations/SimasiaAI/appointments/a0/x.jpg" />'
            : `<img class="task-inline-image" data-storage-path="organizations/SimasiaAI/appointments/${ref.id}/x.jpg" />`,
      });
    });
    await batch.commit();

    const snap = await col.where("recurrenceSeriesId", "==", seriesId).get();
    expect(snap.size).toBe(12);
    const indices = snap.docs.map((d) => d.data().recurrenceIndex).sort((a, b) => a - b);
    expect(indices).toEqual([...Array(12).keys()]);

    // Editing one occurrence does not mutate siblings
    const target = snap.docs[0]!;
    await target.ref.update({ title: "Edited once" });
    const sibling = snap.docs[1]!;
    expect((await sibling.ref.get()).data()?.title).toBe("Weekly");
    expect((await target.ref.get()).data()?.title).toBe("Edited once");

    const paths = snap.docs.map((d) => {
      const html = String(d.data().description ?? "");
      const m = html.match(/data-storage-path="([^"]+)"/);
      return m?.[1];
    });
    expect(new Set(paths).size).toBe(12);
  });
});
