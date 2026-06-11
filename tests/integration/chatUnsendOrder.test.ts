import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract test: unsend deletes Firestore before Storage (integration with Storage mocked in unit layer).
 */
describe("chat unsend order (source contract)", () => {
  it("deletes Firestore message before Storage cleanup", () => {
    const src = readFileSync(resolve(process.cwd(), "src/firebase/chat.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function unsendChatMessage"));
    const deleteDocIdx = fn.indexOf("await deleteDoc(msgRef)");
    const storageIdx = fn.indexOf("await deleteImagesFromStorage");
    expect(deleteDocIdx).toBeGreaterThan(-1);
    expect(storageIdx).toBeGreaterThan(deleteDocIdx);
  });
});
