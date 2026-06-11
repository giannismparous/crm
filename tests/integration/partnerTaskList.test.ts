import { collection, getDocs, query, where } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { partnerTaskQueries } from "../../src/firebase/scopedOrgListeners";
import { authedDb, clearFirestore, ORG, seedDoc } from "../helpers/rulesEnv";

const emulatorUp = process.env.VITEST_EMULATOR_UP === "1";
const allowSkip = process.env.CRM_TEST_ALLOW_SKIP === "1";

const FOUNDER = "ptl-founder";
const ENG = "ptl-eng";

async function seedPeople() {
  await seedDoc(`organizations/${ORG}/people/${FOUNDER}`, {
    id: FOUNDER,
    authUid: FOUNDER,
    orgRole: "founder",
    departments: [],
    name: "Founder",
    email: "ptl-founder@test.local",
  });
  await seedDoc(`organizations/${ORG}/people/${ENG}`, {
    id: ENG,
    authUid: ENG,
    orgRole: "partner",
    departments: ["Engineering"],
    name: "Eng",
    email: "ptl-eng@test.local",
  });
}

describe.skipIf(!emulatorUp && allowSkip)("partner task list with cross-dept data", () => {
  afterEach(async () => {
    await clearFirestore();
  });

  it("engineering partner loads readable tasks only when sales tasks exist", async () => {
    await seedPeople();

    const now = new Date().toISOString();
    const taskBase = {
      description: "",
      assignedById: FOUNDER,
      status: "todo",
      priority: "medium",
      dueDate: now,
      originalDueDate: now,
      postponeCount: 0,
      needsFeedback: false,
      createdAt: now,
      finishedByIds: [],
      feedbackByIds: [],
      feedbackRequests: [],
      comments: [],
      updateEntries: [],
      updates: "",
    };

    await seedDoc(`organizations/${ORG}/tasks/task-eng`, {
      ...taskBase,
      title: "Eng task",
      assigneeIds: [ENG],
      assigneeDepartmentIds: ["Engineering"],
    });
    await seedDoc(`organizations/${ORG}/tasks/task-sales`, {
      ...taskBase,
      title: "Sales task",
      assigneeIds: [],
      assigneeDepartmentIds: ["Sales"],
    });
    await seedDoc(`organizations/${ORG}/tasks/task-general`, {
      ...taskBase,
      title: "General task",
      assigneeIds: [],
      assigneeDepartmentIds: ["General"],
    });
    await seedDoc(`organizations/${ORG}/tasks/task-open`, {
      ...taskBase,
      title: "Open task",
      assigneeIds: [],
      assigneeDepartmentIds: [],
    });

    const engDb = await authedDb(ENG);
    const founderDb = await authedDb(FOUNDER);

    const engQueries = partnerTaskQueries(engDb, ORG, ENG, ["Engineering"], []);
    const engIds = new Set<string>();
    for (const q of engQueries) {
      const snap = await getDocs(q);
      for (const d of snap.docs) engIds.add(d.id);
    }
    expect(engIds.has("task-eng")).toBe(true);
    expect(engIds.has("task-general")).toBe(true);
    expect(engIds.has("task-open")).toBe(true);
    expect(engIds.has("task-sales")).toBe(false);

    const founderSnap = await getDocs(collection(founderDb, `organizations/${ORG}/tasks`));
    expect(founderSnap.docs.map((d) => d.id).sort()).toEqual(["task-eng", "task-sales"].sort());

    const deptOnly = await getDocs(
      query(
        collection(engDb, `organizations/${ORG}/tasks`),
        where("assigneeDepartmentIds", "array-contains-any", ["Engineering"])
      )
    );
    expect(deptOnly.docs.map((d) => d.data().title)).toContain("Eng task");
    expect(deptOnly.docs.map((d) => d.data().title)).not.toContain("Sales task");
  });
});
