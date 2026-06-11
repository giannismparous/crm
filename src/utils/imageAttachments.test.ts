import { describe, expect, it } from "vitest";
import { SIMASIA_AI_ORG_ID } from "../firebase/config";
import {
  isOrgStoragePath,
  normalizeImageAttachments,
  sanitizeStorageDir,
} from "./imageAttachments";

describe("imageAttachments", () => {
  it("validates org storage paths", () => {
    const good = `organizations/${SIMASIA_AI_ORG_ID}/tasks/t1/x.jpg`;
    expect(isOrgStoragePath(good)).toBe(true);
    expect(isOrgStoragePath("organizations/EvilOrg/x.jpg")).toBe(false);
    expect(isOrgStoragePath("../etc/passwd")).toBe(false);
  });

  it("sanitizes storage directories", () => {
    expect(sanitizeStorageDir("tasks/t1/description")).toBe("tasks/t1/description");
    expect(sanitizeStorageDir("../bad")).toBe("bad");
    expect(() => sanitizeStorageDir("")).toThrow();
  });

  it("normalizes attachment records", () => {
    const good = `organizations/${SIMASIA_AI_ORG_ID}/chat/c1/f.jpg`;
    const out = normalizeImageAttachments([
      { url: "https://x", storagePath: good, name: "f.jpg", kind: "image" },
      { url: "", storagePath: "bad" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.storagePath).toBe(good);
  });
});
