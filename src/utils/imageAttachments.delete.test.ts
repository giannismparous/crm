// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("../firebase/config", () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: "u1" } }),
  getFirebaseStorage: () => ({}),
  SIMASIA_AI_ORG_ID: "SimasiaAI",
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  deleteObject: vi.fn((r: { path?: string }) => {
    if (String(r).includes("fail")) return Promise.reject(new Error("fail"));
    return Promise.resolve();
  }),
}));

import { deleteImagesFromStorage } from "./imageAttachments";

describe("deleteImagesFromStorage", () => {
  it("continues after partial Storage deletion failure", async () => {
    const paths = [
      "organizations/SimasiaAI/tasks/t1/a.jpg",
      "organizations/SimasiaAI/tasks/t1/fail.jpg",
      "organizations/SimasiaAI/tasks/t1/b.jpg",
    ];
    await expect(deleteImagesFromStorage(paths)).resolves.toBeUndefined();
  });
});
