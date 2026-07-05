// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { collapseHttpRepeatsAt, normalizeHtmlEntities, repairCorruptedUrlRunsInText } from "./repairCorruptedUrls";
import { repairRichTextBody, sanitizeTaskUpdates } from "./sanitizeRichText";

const RARE =
  "https://rarediseasesgreece.gr/ai-virtual-assistant-4-rds/?utm_source=chatgpt.com";
const FIN = "https://fin.ai";
const AI_ACT = "https://artificialintelligenceact.eu/article/1/?utm_source";

describe("repairCorruptedUrls", () => {
  it("collapses pure repeated url runs", () => {
    expect(repairCorruptedUrlRunsInText(RARE.repeat(5))).toBe(RARE);
    expect(repairCorruptedUrlRunsInText(FIN.repeat(8))).toBe(FIN);
  });

  it("collapses url run before trailing note text", () => {
    const corrupt = `${RARE.repeat(4)} - Ένωση σπάνιων ασθενών Ελλάδας, έχει το δικό της bot`;
    expect(repairCorruptedUrlRunsInText(corrupt)).toBe(
      `${RARE} - Ένωση σπάνιων ασθενών Ελλάδας, έχει το δικό της bot`
    );
  });

  it("collapses merged ?utm_sourcehttps:// duplicates", () => {
    const corrupt = AI_ACT.repeat(4);
    expect(repairCorruptedUrlRunsInText(corrupt)).toBe(AI_ACT);
  });

  it("handles numbered list lines", () => {
    const url = "https://tp-greece.com/human-centered-ai/";
    const corrupt = `Posts:\n1. ${url.repeat(3)}`;
    expect(repairCorruptedUrlRunsInText(corrupt)).toBe(`Posts:\n1. ${url}`);
  });

  it("collapseHttpRepeatsAt finds aligned period", () => {
    const r = collapseHttpRepeatsAt(FIN.repeat(3));
    expect(r.text).toBe(FIN);
    expect(r.skip).toBe(FIN.length * 3);
  });

  it("merges consecutive duplicate anchor tags", () => {
    const corrupt = `<a href="${FIN}" class="rich-text-link">${FIN}</a><a href="${FIN}" class="rich-text-link">${FIN}</a><a href="${FIN}" class="rich-text-link">${FIN}</a>`;
    const repaired = sanitizeTaskUpdates(repairRichTextBody(corrupt));
    expect(repaired.match(/href="https:\/\/fin\.ai"/g)?.length).toBe(1);
    expect(repaired).not.toContain(`${FIN}</a><a`);
  });

  it("collapses &amp; entity bloat in urls", () => {
    const base =
      "https://www.reddit.com/r/n8n/comments/1kt8ag5/?share_id=abc&utm_source=share&utm_medium=android_app";
    let corrupt = base;
    for (let i = 0; i < 8; i += 1) corrupt = corrupt.replace(/&/g, "&amp;");
    expect(normalizeHtmlEntities(corrupt)).toBe(base);
    expect(repairCorruptedUrlRunsInText(corrupt)).toBe(base);
  });

  it("drops partial duplicate url pasted after full url", () => {
    const short = "https://rarediseasesgreece.gr/ai-virtual-assistant-4-rds/";
    const corrupt = `${RARE}${short}- Ένωση σπάνιων ασθενών`;
    expect(repairCorruptedUrlRunsInText(corrupt)).toBe(`${RARE}- Ένωση σπάνιων ασθενών`);
  });
});
