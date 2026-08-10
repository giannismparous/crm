/**
 * Upserts Greece funding-map organizations into Contacts → Reach Out.
 *
 * Source: scripts/reach-out-orgs.json (exported from Excel sheet «Οργανισμοί»).
 * Run: npm run import:reach-out
 *
 * Idempotent: doc ids are reach-out-01 … reach-out-78.
 */

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { loadServiceAccount, CRM_ROOT } = require("./load-service-account.cjs");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const ORG_ID = "SimasiaAI";
const DATA_PATH = resolve(CRM_ROOT, "scripts/reach-out-orgs.json");

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noteLine(label, value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return `<p><strong>${esc(label)}:</strong> ${esc(v)}</p>`;
}

function buildNotes(org) {
  return [
    noteLine("Περιοχή", org.region),
    noteLine("Τι κάνουν / γιατί ταιριάζει", org.why),
    noteLine("Πηγή", org.source),
    noteLine("Δημόσια ΤΝ", org.publicAi),
    noteLine("Σκορ", org.score),
    noteLine("Ζώνη", org.zone),
    noteLine("Διαδρομή", org.route),
    noteLine("Άμεση (1–5)", org.direct),
    noteLine("Χορηγός (1–5)", org.sponsor),
    noteLine("Επιχ./ΕΕ (1–5)", org.grant),
    noteLine("Ταχύτητα (1–5)", org.speed),
    noteLine("Άμεση πληρωμή", org.directPay),
    noteLine("Χορηγία / CSR", org.sponsorship),
    noteLine("Συνολικό έργο", org.totalProject),
    noteLine("Έσοδο SimasiaAI", org.simasiaRevenue),
    noteLine("Λόγος άμεσης", org.reasonDirect),
    noteLine("Λόγος χορηγού", org.reasonSponsor),
    noteLine("Λόγος επιχ.", org.reasonGrant),
    noteLine("Λόγος ταχύτητας", org.reasonSpeed),
    noteLine("Πρόταση", org.proposal),
    noteLine("Ρίσκο", org.risk),
    noteLine("Επόμενο", org.next),
    noteLine("Έλεγχος", org.check),
  ]
    .filter(Boolean)
    .join("\n");
}

function docIdForRow(n) {
  return `reach-out-${String(n).padStart(2, "0")}`;
}

async function main() {
  const orgs = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  if (!Array.isArray(orgs) || orgs.length === 0) {
    console.error("No organizations in", DATA_PATH);
    process.exit(1);
  }

  const serviceAccount = loadServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();
  const col = db.collection("organizations").doc(ORG_ID).collection("contacts");

  let written = 0;
  const expectedIds = new Set();

  // Firestore batches max 500 ops; 78 fits in one, but chunk defensively.
  const chunkSize = 400;
  for (let i = 0; i < orgs.length; i += chunkSize) {
    const chunk = orgs.slice(i, i + chunkSize);
    const batch = db.batch();
    for (const org of chunk) {
      const n = Number(org.n);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`Invalid org # in row: ${JSON.stringify(org)}`);
      }
      const name = String(org.name ?? "").trim();
      if (!name) throw new Error(`Missing organization name for #${n}`);

      const id = docIdForRow(n);
      expectedIds.add(id);
      const ref = col.doc(id);
      batch.set(
        ref,
        {
          id,
          firstName: "-",
          lastName: "",
          company: name,
          jobTitle: String(org.category ?? "").trim(),
          email: "",
          phone: "",
          website: String(org.link ?? "").trim(),
          stage: "lead",
          list: "reachOut",
          estimatedValue: 0,
          currency: "EUR",
          generalNotes: buildNotes(org),
          reachOutSourceRow: n,
          reachOutScore: typeof org.score === "number" ? org.score : Number(org.score) || 0,
          reachOutZone: String(org.zone ?? "").trim(),
          importedAt: new Date().toISOString(),
          importSource: "simasiaai_greece_orgs_funding_map_GR_corrected",
        },
        { merge: true }
      );
      written += 1;
    }
    await batch.commit();
  }

  if (written !== 78 || expectedIds.size !== 78) {
    console.error(`Expected 78 orgs, wrote ${written} unique ids ${expectedIds.size}`);
    process.exit(1);
  }

  // Verify every id exists and list === reachOut
  const snaps = await Promise.all([...expectedIds].map((id) => col.doc(id).get()));
  const missing = snaps.filter((s) => !s.exists).map((s) => s.id);
  const wrongList = snaps
    .filter((s) => s.exists && s.data()?.list !== "reachOut")
    .map((s) => s.id);
  if (missing.length || wrongList.length) {
    console.error({ missing, wrongList });
    process.exit(1);
  }

  console.log(`Imported ${written} Reach Out organizations into organizations/${ORG_ID}/contacts`);
  console.log(`Ids: reach-out-01 … reach-out-78`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
