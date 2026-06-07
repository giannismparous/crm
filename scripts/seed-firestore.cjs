/**
 * Seeds Firestore under organizations/SimasiaAI.
 * Keep data in sync with src/data/seed.ts (same ids and fields).
 *
 * Run: npm run seed:firestore
 * Requires: service-account.json in crm/ or FIREBASE_SERVICE_ACCOUNT_PATH
 */

const { resolve, dirname } = require("node:path");
const { loadServiceAccount, CRM_ROOT } = require("./load-service-account.cjs");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const ORG_ID = "SimasiaAI";

function d(days) {
  return new Date(Date.now() + 86400000 * days).toISOString().slice(0, 10);
}

function addDaysToDateOnly(isoDate, days) {
  const dt = new Date(String(isoDate).slice(0, 10) + "T12:00:00");
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

const seedPeople = [];

const seedTasks = [
  {
    id: "t1",
    title: "Review Q2 onboarding flow",
    description:
      "Walk through the new signup screens and list any friction points for the product sync.",
    assigneeIds: ["p3"],
    assigneeId: "p3",
    assignedById: "p2",
    status: "in_progress",
    priority: "high",
    dueDate: d(2),
    originalDueDate: d(2),
    postponeCount: 0,
    needsFeedback: true,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "t2",
    title: "Prepare investor update deck",
    description: "Slides 1–8: metrics, runway, hires. Include one chart on pipeline health.",
    assigneeIds: ["p2"],
    assigneeId: "p2",
    assignedById: "p1",
    status: "todo",
    priority: "urgent",
    dueDate: d(5),
    originalDueDate: d(2),
    postponeCount: 1,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "t3",
    title: "Migrate staging API keys",
    description: "Rotate keys in 1Password and update Vercel env for preview deployments.",
    assigneeIds: ["p4"],
    assigneeId: "p4",
    assignedById: "p2",
    status: "review",
    priority: "medium",
    dueDate: d(7),
    originalDueDate: d(7),
    postponeCount: 0,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "t4",
    title: "Vendor contract — logistics",
    description: "Compare three quotes and recommend primary + backup carrier.",
    assigneeIds: ["p1"],
    assigneeId: "p1",
    assignedById: "p2",
    status: "done",
    priority: "low",
    dueDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    originalDueDate: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10),
    postponeCount: 1,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: "t5",
    title: "[Seed] Urgent — enterprise pilot contract review",
    description: "Legal + sales: redline enterprise MSA before counter-sign Friday. Priority badge check (urgent + sales).",
    assigneeIds: ["p2"],
    assigneeId: "p2",
    assignedById: "p1",
    status: "todo",
    priority: "urgent",
    dueDate: d(1),
    originalDueDate: d(1),
    postponeCount: 0,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 86400000 * 0.5).toISOString(),
  },
  {
    id: "t6",
    title: "[Seed] High — Q3 campaign landing pages",
    description: "Marketing: wire copy + hero variants for launch week. Priority check (high + marketing).",
    assigneeIds: ["p3"],
    assigneeId: "p3",
    assignedById: "p2",
    status: "todo",
    priority: "high",
    dueDate: d(3),
    originalDueDate: d(3),
    postponeCount: 0,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "t7",
    title: "[Seed] Medium — onboard summer intern checklist",
    description: "HR: desk, accounts, buddy schedule. Priority check (medium + HR).",
    assigneeIds: ["p1"],
    assigneeId: "p1",
    assignedById: "p3",
    status: "in_progress",
    priority: "medium",
    dueDate: d(6),
    originalDueDate: d(6),
    postponeCount: 0,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 86400000 * 1.5).toISOString(),
  },
  {
    id: "t8",
    title: "[Seed] Low — refresh cookie policy page",
    description: "Legal: minor copy updates from template. Priority check (low + legal).",
    assigneeIds: ["p4"],
    assigneeId: "p4",
    assignedById: "p1",
    status: "todo",
    priority: "low",
    dueDate: d(21),
    originalDueDate: d(21),
    postponeCount: 0,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "t9",
    title: "[Seed] Urgent — VIP account down, bridge call",
    description: "Exec escalation, status page + RCA draft. Priority check (urgent + general).",
    assigneeIds: ["p2", "p1"],
    assigneeId: "p2",
    assignedById: "p4",
    status: "todo",
    priority: "urgent",
    dueDate: d(0),
    originalDueDate: d(0),
    postponeCount: 0,
    needsFeedback: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "t10",
    title: "[Seed] High — office Wi-Fi audit (general)",
    description: "General ops ticket for IT walkthrough. Priority check (high + general).",
    assigneeIds: ["p1"],
    assigneeId: "p1",
    assignedById: "p2",
    status: "todo",
    priority: "high",
    dueDate: d(4),
    originalDueDate: d(4),
    postponeCount: 0,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "t11",
    title: "[Seed] Postponed³ — vendor security questionnaire",
    description:
      "Finance: seed task with postponeCount: 3 (three +1 week bumps from the original date). UI should show Postponed with superscript 3.",
    assigneeIds: ["p2"],
    assigneeId: "p2",
    assignedById: "p1",
    status: "todo",
    priority: "medium",
    originalDueDate: d(-10),
    dueDate: addDaysToDateOnly(addDaysToDateOnly(addDaysToDateOnly(d(-10), 7), 7), 7),
    postponeCount: 3,
    needsFeedback: false,
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
];

const seedContacts = [
  {
    id: "c1",
    firstName: "Alexandros",
    lastName: "Vlachos",
    company: "Helios Logistics SA",
    jobTitle: "Procurement Director",
    email: "a.vlachos@helios-logistics.example",
    phone: "+30 210 555 0142",
    website: "https://helios-logistics.example",
    stage: "negotiation",
    estimatedValue: 48000,
    currency: "EUR",
    lastContactedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    generalNotes:
      "Interested in annual retainer. Legal is slow — keep momentum with weekly check-ins.",
    reminders: [
      {
        id: "r1",
        title: "Send revised SLA draft",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        notes: "Highlight uptime SLA and support response times.",
        done: false,
      },
      {
        id: "r2",
        title: "Book demo with their IT lead",
        dueAt: new Date(Date.now() + 86400000 * 4).toISOString(),
        notes: "Focus on SSO and audit logs.",
        done: false,
      },
    ],
  },
  {
    id: "c2",
    firstName: "Sofia",
    lastName: "Markou",
    company: "Northwind Retail",
    jobTitle: "Head of Growth",
    email: "sofia.markou@northwind.example",
    phone: "+30 2310 555 8890",
    website: "https://northwind.example",
    stage: "qualified",
    estimatedValue: 12000,
    currency: "EUR",
    lastContactedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    generalNotes: "Pilot for one region first. Champion is Sofia; budget owner is CFO.",
    reminders: [
      {
        id: "r3",
        title: "Share case study — similar retailer",
        dueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
        notes: "Use anonymized metrics from Festival project.",
        done: true,
      },
    ],
  },
  {
    id: "c3",
    firstName: "Giorgos",
    lastName: "Petridis",
    company: "Atlas Education Group",
    jobTitle: "IT Manager",
    email: "g.petridis@atlas-edu.example",
    phone: "+30 210 555 3300",
    website: "https://atlas-edu.example",
    stage: "lead",
    estimatedValue: 8500,
    currency: "EUR",
    lastContactedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    generalNotes: "Inbound from website form. Asked about GDPR and student data residency.",
    reminders: [
      {
        id: "r4",
        title: "Send security one-pager + DPA template",
        dueAt: new Date().toISOString(),
        notes: "Attach link to trust page.",
        done: false,
      },
    ],
  },
];

function loadCredential() {
  return loadServiceAccount();
}

function initAdmin() {
  if (getApps().length === 0) {
    initializeApp({ credential: cert(loadCredential()) });
  }
}

async function seedFirestore() {
  initAdmin();
  const db = getFirestore();

  const orgRef = db.collection("organizations").doc(ORG_ID);
  await orgRef.set(
    {
      name: "Simasia AI",
      slug: ORG_ID,
      seededAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const batch = db.batch();

  for (const t of seedTasks) {
    batch.set(orgRef.collection("tasks").doc(t.id), { ...t });
  }
  for (const c of seedContacts) {
    const { reminders, ...contact } = c;
    const ref = orgRef.collection("contacts").doc(c.id);
    batch.set(ref, { ...contact });
    for (const r of reminders) {
      batch.set(ref.collection("reminders").doc(r.id), {
        title: r.title,
        dueAt: r.dueAt,
        notes: r.notes,
        done: r.done,
      });
    }
  }

  await batch.commit();
  console.log(`Seeded organizations/${ORG_ID}: tasks, contacts (+ reminders). Team members come from Auth sign-up.`);
}

if (require.main === module) {
  seedFirestore().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  initAdmin,
  seedFirestore,
  ORG_ID,
  CRM_ROOT,
  loadCredential,
};
