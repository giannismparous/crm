import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  authedDb,
  clearFirestore,
  getRulesTestEnv,
  ORG,
  seedDoc,
  unauthedDb,
} from "../helpers/rulesEnv";

const FOUNDER = "founder-1";
const ENG = "partner-eng";
const SALES = "partner-sales";
const OTHER = "partner-other";
const FOUNDER_EMAIL = "giannismparous@gmail.com";

async function seedPeople() {
  await seedDoc(`organizations/${ORG}/people/${FOUNDER}`, {
    id: FOUNDER,
    authUid: FOUNDER,
    orgRole: "founder",
    departments: [],
    name: "Founder",
    email: "founder@test.local",
  });
  await seedDoc(`organizations/${ORG}/people/${ENG}`, {
    id: ENG,
    authUid: ENG,
    orgRole: "partner",
    departments: ["Engineering"],
    name: "Eng Partner",
    email: "eng@test.local",
  });
  await seedDoc(`organizations/${ORG}/people/${SALES}`, {
    id: SALES,
    authUid: SALES,
    orgRole: "partner",
    departments: ["Sales"],
    name: "Sales Partner",
    email: "sales@test.local",
  });
  await seedDoc(`organizations/${ORG}/people/${OTHER}`, {
    id: OTHER,
    authUid: OTHER,
    orgRole: "partner",
    departments: ["Marketing"],
    name: "Other Partner",
    email: "other@test.local",
  });
}

const emulatorUp = process.env.VITEST_EMULATOR_UP === "1";
const allowSkip = process.env.CRM_TEST_ALLOW_SKIP === "1";

describe.skipIf(!emulatorUp && allowSkip)("Firestore security rules", () => {
  beforeAll(async () => {
    await getRulesTestEnv();
  });

  afterEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    const testEnv = await getRulesTestEnv();
    await testEnv.cleanup();
  });

  describe("people", () => {
    it("founder reads all; partner reads self and same-dept", async () => {
      await seedPeople();
      const founderDb = await authedDb(FOUNDER);
      const engDb = await authedDb(ENG);
      await expect(getDoc(doc(founderDb, `organizations/${ORG}/people/${SALES}`))).resolves.toBeDefined();
      await expect(getDoc(doc(engDb, `organizations/${ORG}/people/${ENG}`))).resolves.toBeDefined();
      await expect(getDoc(doc(engDb, `organizations/${ORG}/people/${FOUNDER}`))).rejects.toThrow();
    });

    it("partner cannot change own role or departments", async () => {
      await seedPeople();
      const engDb = await authedDb(ENG);
      await expect(
        updateDoc(doc(engDb, `organizations/${ORG}/people/${ENG}`), { orgRole: "founder" })
      ).rejects.toThrow();
      await expect(
        updateDoc(doc(engDb, `organizations/${ORG}/people/${ENG}`), { departments: ["Sales"] })
      ).rejects.toThrow();
    });

    it("partner can update safe own profile fields", async () => {
      await seedPeople();
      const engDb = await authedDb(ENG);
      await expect(
        updateDoc(doc(engDb, `organizations/${ORG}/people/${ENG}`), { title: "Senior" })
      ).resolves.toBeUndefined();
    });
  });

  describe("tasks", () => {
    const taskPath = `organizations/${ORG}/tasks/task-1`;

    beforeEach(async () => {
      await seedPeople();
      await seedDoc(taskPath, {
        title: "Dept task",
        assigneeIds: [],
        assigneeDepartmentIds: ["Engineering"],
        assignedById: FOUNDER,
        status: "todo",
        priority: "medium",
        dueDate: new Date().toISOString(),
        originalDueDate: new Date().toISOString(),
        postponeCount: 0,
        needsFeedback: false,
        createdAt: new Date().toISOString(),
      });
    });

    it("partner reads dept task; unrelated partner denied", async () => {
      const engDb = await authedDb(ENG);
      const salesDb = await authedDb(SALES);
      await expect(getDoc(doc(engDb, taskPath))).resolves.toBeDefined();
      await expect(getDoc(doc(salesDb, taskPath))).rejects.toThrow();
    });

    it("partner cannot delete; founder can", async () => {
      const engDb = await authedDb(ENG);
      const founderDb = await authedDb(FOUNDER);
      await expect(deleteDoc(doc(engDb, taskPath))).rejects.toThrow();
      await expect(deleteDoc(doc(founderDb, taskPath))).resolves.toBeUndefined();
    });

    it("partner can cancel via update", async () => {
      const engDb = await authedDb(ENG);
      await expect(
        updateDoc(doc(engDb, taskPath), { status: "canceled", canceledAt: new Date().toISOString() })
      ).resolves.toBeUndefined();
    });

    it("partner scoped list succeeds with cross-dept tasks in org", async () => {
      await seedDoc(`organizations/${ORG}/tasks/task-sales`, {
        title: "Sales only",
        assigneeIds: [],
        assigneeDepartmentIds: ["Sales"],
        assignedById: FOUNDER,
        status: "todo",
        priority: "medium",
        dueDate: new Date().toISOString(),
        originalDueDate: new Date().toISOString(),
        postponeCount: 0,
        needsFeedback: false,
        createdAt: new Date().toISOString(),
      });
      const engDb = await authedDb(ENG);
      const founderDb = await authedDb(FOUNDER);
      const tasksCol = collection(engDb, `organizations/${ORG}/tasks`);

      await expect(getDocs(tasksCol)).rejects.toThrow();

      const engDeptSnap = await getDocs(
        query(tasksCol, where("assigneeDepartmentIds", "array-contains-any", ["Engineering"]))
      );
      expect(engDeptSnap.docs.map((d) => d.id)).toContain("task-1");
      expect(engDeptSnap.docs.map((d) => d.id)).not.toContain("task-sales");

      const assigneeSnap = await getDocs(
        query(tasksCol, where("assigneeIds", "array-contains", ENG))
      );
      expect(assigneeSnap.docs.map((d) => d.id)).not.toContain("task-sales");

      const founderSnap = await getDocs(collection(founderDb, `organizations/${ORG}/tasks`));
      expect(founderSnap.docs.map((d) => d.id).sort()).toEqual(["task-1", "task-sales"].sort());
    });
  });

  describe("personalReminders", () => {
    const base = {
      title: "Reminder",
      dueAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: "open",
    };

    beforeEach(async () => {
      await seedPeople();
    });

    it("owner reads own reminder", async () => {
      const path = `organizations/${ORG}/personalReminders/r-owner`;
      await seedDoc(path, { ...base, ownerId: ENG, participantIds: [], participantDepartmentIds: [] });
      const engDb = await authedDb(ENG);
      await expect(getDoc(doc(engDb, path))).resolves.toBeDefined();
    });

    it("shared person reads reminder", async () => {
      const path = `organizations/${ORG}/personalReminders/r-shared`;
      await seedDoc(path, {
        ...base,
        ownerId: FOUNDER,
        participantIds: [ENG],
        participantDepartmentIds: [],
      });
      const engDb = await authedDb(ENG);
      await expect(getDoc(doc(engDb, path))).resolves.toBeDefined();
    });

    it("shared department partner reads reminder", async () => {
      const path = `organizations/${ORG}/personalReminders/r-dept`;
      await seedDoc(path, {
        ...base,
        ownerId: FOUNDER,
        participantIds: [],
        participantDepartmentIds: ["Engineering"],
      });
      const engDb = await authedDb(ENG);
      await expect(getDoc(doc(engDb, path))).resolves.toBeDefined();
    });

    it("unrelated partner cannot read", async () => {
      const path = `organizations/${ORG}/personalReminders/r-private`;
      await seedDoc(path, {
        ...base,
        ownerId: FOUNDER,
        participantIds: [SALES],
        participantDepartmentIds: ["Sales"],
      });
      const engDb = await authedDb(ENG);
      await expect(getDoc(doc(engDb, path))).rejects.toThrow();
    });

    it("founder reads any reminder", async () => {
      const path = `organizations/${ORG}/personalReminders/r-founder`;
      await seedDoc(path, {
        ...base,
        ownerId: ENG,
        participantIds: [],
        participantDepartmentIds: [],
      });
      const founderDb = await authedDb(FOUNDER);
      await expect(getDoc(doc(founderDb, path))).resolves.toBeDefined();
    });

    it("partner scoped list works without rules eval errors", async () => {
      await seedDoc(`organizations/${ORG}/personalReminders/r-missing-fields`, {
        title: "Legacy",
        dueAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: "open",
        participantDepartmentIds: ["Sales"],
      });
      await seedDoc(`organizations/${ORG}/personalReminders/r-eng`, {
        ...base,
        ownerId: ENG,
        participantIds: [],
        participantDepartmentIds: [],
      });
      const engDb = await authedDb(ENG);
      const col = collection(engDb, `organizations/${ORG}/personalReminders`);
      await expect(getDocs(col)).rejects.toThrow();
      const ownerSnap = await getDocs(query(col, where("ownerId", "==", ENG)));
      expect(ownerSnap.docs.map((d) => d.id)).toContain("r-eng");
      expect(ownerSnap.docs.map((d) => d.id)).not.toContain("r-missing-fields");
    });
  });

  describe("projects", () => {
    const projectPath = `organizations/${ORG}/projects/p1`;

    beforeEach(async () => {
      await seedPeople();
      await seedDoc(projectPath, {
        name: "Eng project",
        description: "",
        color: "#000",
        departmentIds: ["Engineering"],
        completed: false,
        createdAt: new Date().toISOString(),
      });
    });

    it("partner reads own dept; cannot write", async () => {
      const engDb = await authedDb(ENG);
      const salesDb = await authedDb(SALES);
      await expect(getDoc(doc(engDb, projectPath))).resolves.toBeDefined();
      await expect(getDoc(doc(salesDb, projectPath))).rejects.toThrow();
      await expect(setDoc(doc(engDb, `organizations/${ORG}/projects/p2`), { name: "x" })).rejects.toThrow();
    });

    it("founder can create/update/delete", async () => {
      const founderDb = await authedDb(FOUNDER);
      const p2 = `organizations/${ORG}/projects/p2`;
      await expect(
        setDoc(doc(founderDb, p2), {
          name: "New",
          description: "",
          color: "#000",
          departmentIds: ["Sales"],
          completed: false,
          createdAt: new Date().toISOString(),
        })
      ).resolves.toBeUndefined();
      await expect(deleteDoc(doc(founderDb, projectPath))).resolves.toBeUndefined();
    });
  });

  describe("appointments", () => {
    const aptPath = `organizations/${ORG}/appointments/a1`;

    beforeEach(async () => {
      await seedPeople();
      await seedDoc(aptPath, {
        title: "Sync",
        startsAt: new Date().toISOString(),
        participantIds: [ENG],
        participantDepartmentIds: [],
        createdById: FOUNDER,
        status: "scheduled",
        createdAt: new Date().toISOString(),
      });
    });

    it("participant partner reads; unrelated denied", async () => {
      const engDb = await authedDb(ENG);
      const salesDb = await authedDb(SALES);
      await expect(getDoc(doc(engDb, aptPath))).resolves.toBeDefined();
      await expect(getDoc(doc(salesDb, aptPath))).rejects.toThrow();
    });

    it("partner can cancel; cannot hard delete", async () => {
      const engDb = await authedDb(ENG);
      const founderDb = await authedDb(FOUNDER);
      await expect(
        updateDoc(doc(engDb, aptPath), { status: "canceled", canceledAt: new Date().toISOString() })
      ).resolves.toBeUndefined();
      await expect(deleteDoc(doc(engDb, aptPath))).rejects.toThrow();
      await expect(deleteDoc(doc(founderDb, aptPath))).resolves.toBeUndefined();
    });
  });

  describe("contacts", () => {
    it("founder CRUD; partner denied", async () => {
      await seedPeople();
      const founderDb = await authedDb(FOUNDER);
      const engDb = await authedDb(ENG);
      const path = `organizations/${ORG}/contacts/c1`;
      await expect(
        setDoc(doc(founderDb, path), {
          firstName: "A",
          lastName: "B",
          company: "",
          stage: "lead",
          createdAt: new Date().toISOString(),
        })
      ).resolves.toBeUndefined();
      await expect(getDoc(doc(engDb, path))).rejects.toThrow();
      await expect(getDocs(collection(engDb, `organizations/${ORG}/contacts`))).rejects.toThrow();
    });
  });

  describe("notifications", () => {
    it("recipient reads own; others denied", async () => {
      await seedPeople();
      const path = `organizations/${ORG}/notifications/n1`;
      await seedDoc(path, {
        recipientId: ENG,
        kind: "task_created",
        read: false,
        createdAt: new Date().toISOString(),
      });
      const engDb = await authedDb(ENG);
      const salesDb = await authedDb(SALES);
      await expect(getDoc(doc(engDb, path))).resolves.toBeDefined();
      await expect(getDoc(doc(salesDb, path))).rejects.toThrow();
      await expect(updateDoc(doc(engDb, path), { read: true })).resolves.toBeUndefined();
    });
  });

  describe("chat", () => {
    const convPath = `organizations/${ORG}/chatConversations/dm1`;
    const msgPath = `${convPath}/messages/m1`;

    beforeEach(async () => {
      await seedPeople();
      await seedDoc(convPath, {
        kind: "dm",
        memberIds: [ENG, SALES],
        createdById: ENG,
        createdAt: new Date().toISOString(),
        dmKey: `${ENG}_${SALES}`,
      });
    });

    it("member reads; unrelated partner denied; founder reads via org-wide rule", async () => {
      const engDb = await authedDb(ENG);
      const otherDb = await authedDb(OTHER);
      const founderDb = await authedDb(FOUNDER);
      await expect(getDoc(doc(engDb, convPath))).resolves.toBeDefined();
      await expect(getDoc(doc(otherDb, convPath))).rejects.toThrow();
      await expect(getDoc(doc(founderDb, convPath))).resolves.toBeDefined();
    });

    it("author unsend within 5 minutes; after window denied", async () => {
      const engDb = await authedDb(ENG);
      const now = Date.now();
      await seedDoc(msgPath, {
        authorId: ENG,
        body: "hi",
        createdAt: new Date(now).toISOString(),
        createdAtMs: now,
      });
      await expect(deleteDoc(doc(engDb, msgPath))).resolves.toBeUndefined();

      await seedDoc(`${convPath}/messages/m2`, {
        authorId: ENG,
        body: "old",
        createdAt: new Date(now - 6 * 60 * 1000).toISOString(),
        createdAtMs: now - 6 * 60 * 1000,
      });
      await expect(deleteDoc(doc(engDb, `${convPath}/messages/m2`))).rejects.toThrow();
    });

    it("missing createdAtMs blocks author unsend", async () => {
      const engDb = await authedDb(ENG);
      await seedDoc(msgPath, {
        authorId: ENG,
        body: "legacy",
        createdAt: new Date().toISOString(),
      });
      await expect(deleteDoc(doc(engDb, msgPath))).rejects.toThrow();
    });

    it("founder can delete any message (moderation rule)", async () => {
      const founderDb = await authedDb(FOUNDER);
      await seedDoc(convPath, {
        kind: "founders",
        memberIds: [FOUNDER],
        createdById: FOUNDER,
        createdAt: new Date().toISOString(),
      });
      const foundersMsg = `organizations/${ORG}/chatConversations/founders/messages/fm1`;
      await seedDoc(foundersMsg, {
        authorId: ENG,
        body: "old",
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        createdAtMs: Date.now() - 10 * 60 * 1000,
      });
      // Founder must be conv member — seed founders channel with founder member
      await seedDoc(`organizations/${ORG}/chatConversations/founders`, {
        kind: "founders",
        memberIds: [FOUNDER, ENG],
        createdById: FOUNDER,
        createdAt: new Date().toISOString(),
      });
      await expect(deleteDoc(doc(founderDb, foundersMsg))).resolves.toBeUndefined();
    });
  });

  describe("integrations", () => {
    it("client cannot read/write google calendar integration docs", async () => {
      await seedPeople();
      const founderDb = await authedDb(FOUNDER);
      const path = `users/${FOUNDER}/integrations/googleCalendar`;
      await seedDoc(path, { connected: true, refreshToken: "secret" });
      await expect(getDoc(doc(founderDb, path))).rejects.toThrow();
      await expect(setDoc(doc(founderDb, path), { connected: false })).rejects.toThrow();
    });
  });

  describe("registration seeds", () => {
    it("founder lists/creates; partner cannot", async () => {
      await seedPeople();
      const founderDb = await authedDb(FOUNDER);
      const engDb = await authedDb(ENG);
      const seedPath = `organizations/${ORG}/registrationSeeds/seed1`;
      await expect(
        setDoc(doc(founderDb, seedPath), {
          orgRole: "partner",
          departments: ["Engineering"],
          issuedById: FOUNDER,
          used: false,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        })
      ).resolves.toBeUndefined();
      await expect(getDocs(collection(founderDb, `organizations/${ORG}/registrationSeeds`))).resolves.toBeDefined();
      await expect(getDocs(collection(engDb, `organizations/${ORG}/registrationSeeds`))).rejects.toThrow();
    });

    it("public get on seed allowed for registration", async () => {
      const seedPath = `organizations/${ORG}/registrationSeeds/public-seed`;
      await seedDoc(seedPath, {
        orgRole: "partner",
        departments: ["Engineering"],
        used: false,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const anonDb = await unauthedDb();
      await expect(getDoc(doc(anonDb, seedPath))).resolves.toBeDefined();
    });
  });
});
