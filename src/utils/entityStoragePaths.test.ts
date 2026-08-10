// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SIMASIA_AI_ORG_ID } from "../firebase/config";
import {
  storagePathsFromAppointment,
  storagePathsFromContact,
  storagePathsFromPersonalReminder,
  storagePathsFromTask,
} from "./entityStoragePaths";
import { makeAppointment, makeTask } from "../../tests/helpers/fixtures";
import type { SalesContact } from "../types";

const path = `organizations/${SIMASIA_AI_ORG_ID}/tasks/t1/description/img.jpg`;

describe("entityStoragePaths", () => {
  it("collects paths from task html and attachments", () => {
    const task = makeTask({
      id: "t1",
      description: `<img class="task-inline-image" src="x" data-storage-path="${path}" />`,
      comments: [
        {
          id: "c1",
          authorId: "u1",
          body: "",
          createdAt: new Date().toISOString(),
          attachments: [{ url: "u", storagePath: `${path}2` }],
        },
      ],
    });
    const paths = storagePathsFromTask(task);
    expect(paths).toContain(path);
    expect(paths).toContain(`${path}2`);
  });

  it("collects appointment description and attachments", () => {
    const apt = makeAppointment({
      id: "a1",
      description: `<img class="task-inline-image" data-storage-path="${path}" />`,
      attachments: [{ url: "u", storagePath: `${path}a` }],
    });
    const paths = storagePathsFromAppointment(apt);
    expect(paths).toEqual(expect.arrayContaining([path, `${path}a`]));
  });

  it("collects contact notes paths", () => {
    const contact: SalesContact = {
      id: "c1",
      firstName: "A",
      lastName: "B",
      company: "",
      jobTitle: "",
      email: "",
      phone: "",
      website: "",
      stage: "lead",
      estimatedValue: 0,
      currency: "EUR",
      lastContactedAt: "",
      generalNotes: `<img class="task-inline-image" data-storage-path="${path}" />`,
      reminders: [],
      list: "sales",
    };
    expect(storagePathsFromContact(contact)).toContain(path);
  });

  it("collects personal reminder paths", () => {
    const reminder = {
      id: "r1",
      ownerId: "u1",
      title: "t",
      dueAt: new Date().toISOString(),
      notes: `<img class="task-inline-image" data-storage-path="${path}" />`,
      done: false,
      createdAt: new Date().toISOString(),
      participantIds: [],
      participantDepartmentIds: [],
    };
    expect(storagePathsFromPersonalReminder(reminder)).toContain(path);
  });
});
