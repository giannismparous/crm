// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SIMASIA_AI_ORG_ID } from "../firebase/config";
import {
  looksLikeHtml,
  richTextToPlainText,
  sanitizeTaskUpdates,
  taskUpdatesToPlainText,
} from "./sanitizeRichText";
import { isStoredRichTextBody } from "./richTextImages";

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

  it("preserves resized inline image width", () => {
    const html = `<span class="task-inline-image-wrap loadable-media-shell"><img class="task-inline-image loadable-ready" src="https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg" data-storage-path="${safePath}" style="width: 300px; height: auto;" data-intrinsic-w="2000" data-intrinsic-h="1500" /></span>`;
    const out = sanitizeTaskUpdates(html);
    expect(out).toContain('style="width: 300px"');
    expect(out).not.toContain("loadable-ready");
    expect(out).not.toContain("task-inline-image-wrap");
  });

  it("preserves width from live dom innerHTML after resize", () => {
    const div = document.createElement("div");
    div.innerHTML = `<img class="task-inline-image" src="https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg" data-storage-path="${safePath}" />`;
    const img = div.querySelector("img")!;
    img.style.width = "300px";
    img.style.height = "auto";
    const out = sanitizeTaskUpdates(div.innerHTML);
    expect(out).toContain('style="width: 300px"');
  });

  it("preserves width when only the wrapper was resized", () => {
    const html = `<span class="task-inline-image-wrap loadable-media-shell" style="width: 220px"><img class="task-inline-image" src="https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg" data-storage-path="${safePath}" data-intrinsic-w="2000" data-intrinsic-h="1500" /></span>`;
    const out = sanitizeTaskUpdates(html);
    expect(out).toContain('style="width: 220px"');
  });

  it("preserves line breaks from pasted html", () => {
    const html = "First line<br><br>Second line with https://example.com/very/long/url/path";
    const out = sanitizeTaskUpdates(html);
    expect(out).toContain("<br>");
    expect(out).toContain("First line");
    expect(out).toContain("Second line");
  });

  it("detects pasted html with breaks as stored rich text", () => {
    expect(isStoredRichTextBody("Hello<br><br>World")).toBe(true);
    expect(isStoredRichTextBody("plain notes only")).toBe(false);
  });

  it("linkifies https urls in plain text", () => {
    const out = sanitizeTaskUpdates("See https://example.com/path for details");
    expect(out).toContain('class="rich-text-link"');
    expect(out).toContain('href="https://example.com/path"');
    expect(out).toContain("https://example.com/path</a>");
  });
});
