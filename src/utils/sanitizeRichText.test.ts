// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SIMASIA_AI_ORG_ID } from "../firebase/config";
import {
  looksLikeHtml,
  richTextToPlainText,
  sanitizeTaskUpdates,
  taskUpdatesToPlainText,
} from "./sanitizeRichText";

const safePath = `organizations/${SIMASIA_AI_ORG_ID}/tasks/t1/description/x.jpg`;

describe("sanitizeRichText", () => {
  it("strips script tags", () => {
    const out = sanitizeTaskUpdates('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).toContain("ok");
  });

  it("allows bold and org storage images", () => {
    const html = `<p><b>Hi</b></p><img class="task-inline-image" src="https://x" data-storage-path="${safePath}" />`;
    const out = sanitizeTaskUpdates(html);
    expect(out).toContain("Hi");
    expect(out).toContain(safePath);
  });

  it("rejects external storage paths", () => {
    const html = `<img data-storage-path="organizations/OtherOrg/x.jpg" />`;
    const out = sanitizeTaskUpdates(html);
    expect(out).not.toContain("OtherOrg");
  });

  it("converts html to plain text", () => {
    expect(taskUpdatesToPlainText("<p>Hello <b>world</b></p>")).toContain("Hello");
    expect(richTextToPlainText("plain")).toBe("plain");
    expect(looksLikeHtml("<p>x</p>")).toBe(true);
    expect(looksLikeHtml("plain")).toBe(false);
  });
});
