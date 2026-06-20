/**
 * Migrates legacy materialized recurring appointments (many Firestore docs per series)
 * to the current single-doc model (recurrenceRule + recurrenceCount on one doc).
 *
 * - Keeps the series master (recurrenceIndex 0, or lowest index if missing)
 * - Strips recurrenceSeriesId / recurrenceIndex from the master
 * - Deletes sibling occurrence docs (recurrenceIndex > 0)
 *
 * Run (preview): npm run cleanup:legacy-appointment-series -- --dry-run
 * Run (apply):   npm run cleanup:legacy-appointment-series
 */

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initAdmin, ORG_ID } = require("./seed-firestore.cjs");

const MS_DAY = 86400000;

function inferRecurrenceRule(docs) {
  const sorted = [...docs].sort(
    (a, b) => (a.data.recurrenceIndex ?? 0) - (b.data.recurrenceIndex ?? 0)
  );
  const existing = sorted.find((d) => d.data.recurrenceRule)?.data.recurrenceRule;
  if (existing && typeof existing === "object" && existing.kind) {
    return {
      kind: existing.kind,
      interval: Number(existing.interval) >= 1 ? Math.floor(Number(existing.interval)) : 1,
      ...(existing.kind === "monthly_day" && existing.dayOfMonth
        ? { dayOfMonth: Math.min(31, Math.max(1, Math.floor(Number(existing.dayOfMonth)))) }
        : {}),
    };
  }

  if (sorted.length >= 2) {
    const t0 = new Date(sorted[0].data.startsAt).getTime();
    const t1 = new Date(sorted[1].data.startsAt).getTime();
    if (!Number.isNaN(t0) && !Number.isNaN(t1) && t1 > t0) {
      const deltaDays = Math.round((t1 - t0) / MS_DAY);
      if (deltaDays >= 6 && deltaDays <= 8) return { kind: "weekly", interval: 1 };
      if (deltaDays >= 1 && deltaDays <= 2) return { kind: "daily", interval: deltaDays || 1 };
      if (deltaDays >= 27 && deltaDays <= 32) return { kind: "monthly", interval: 1 };
    }
  }

  return { kind: "weekly", interval: 1 };
}

function normalizeCount(value, fallback) {
  const n = Math.floor(Number(value));
  if (Number.isFinite(n) && n >= 2) return Math.min(52, n);
  return Math.min(52, Math.max(2, fallback));
}

function groupLegacySeries(docs) {
  const groups = new Map();
  for (const doc of docs) {
    const seriesId = String(doc.data.recurrenceSeriesId ?? "").trim();
    if (!seriesId) continue;
    const list = groups.get(seriesId) ?? [];
    list.push(doc);
    groups.set(seriesId, list);
  }
  return groups;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  initAdmin();
  const db = getFirestore();
  const col = db.collection("organizations").doc(ORG_ID).collection("appointments");
  const snap = await col.get();

  const legacyDocs = snap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
    .filter((d) => String(d.data.recurrenceSeriesId ?? "").trim());

  if (legacyDocs.length === 0) {
    console.log("No legacy materialized appointment series found.");
    return;
  }

  const groups = groupLegacySeries(legacyDocs);
  let mastersUpdated = 0;
  let siblingsDeleted = 0;

  for (const [seriesId, docs] of groups) {
    const sorted = [...docs].sort(
      (a, b) => (a.data.recurrenceIndex ?? 0) - (b.data.recurrenceIndex ?? 0)
    );
    const master = sorted.find((d) => (d.data.recurrenceIndex ?? 0) === 0) ?? sorted[0];
    const siblings = sorted.filter((d) => d.id !== master.id);

    const recurrenceRule = inferRecurrenceRule(sorted);
    const recurrenceCount = normalizeCount(
      master.data.recurrenceCount ?? sorted.find((d) => d.data.recurrenceCount)?.data.recurrenceCount,
      sorted.length
    );

    console.log(
      `\nSeries ${seriesId}: master=${master.id}, siblings=${siblings.length}, ` +
        `rule=${recurrenceRule.kind}×${recurrenceRule.interval}, count=${recurrenceCount}`
    );

    const masterPatch = {
      recurrenceRule,
      recurrenceCount,
      recurrenceSeriesId: FieldValue.delete(),
      recurrenceIndex: FieldValue.delete(),
    };

    if (dryRun) {
      console.log("  [dry-run] would update master and delete:", siblings.map((s) => s.id).join(", ") || "(none)");
      mastersUpdated++;
      siblingsDeleted += siblings.length;
      continue;
    }

    await master.ref.update(masterPatch);
    mastersUpdated++;

    for (const sibling of siblings) {
      await sibling.ref.delete();
      siblingsDeleted++;
      console.log("  deleted sibling:", sibling.id);
    }
  }

  console.log(
    dryRun
      ? `\nDry run complete. Would update ${mastersUpdated} master(s), delete ${siblingsDeleted} sibling(s).`
      : `\nDone. Updated ${mastersUpdated} master(s), deleted ${siblingsDeleted} sibling(s). Refresh the app; run Google Calendar sync if needed.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
