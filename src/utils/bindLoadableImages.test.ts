// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { bindLoadableImages } from "./bindLoadableImages";
import { parseWidthPx, syncPersistedInlineMediaWidths } from "./mediaPlaceholder";

describe("bindLoadableImages", () => {
  let root: HTMLDivElement;

  afterEach(() => {
    root?.remove();
  });

  it("applies persisted width in read-only rich text view", async () => {
    root = document.createElement("div");
    root.className = "simple-rich-text";
    root.dataset.richTextEditable = "false";
    root.innerHTML =
      '<img src="https://example.com/photo.jpg" alt="x" class="task-inline-image" style="width: 240px" data-intrinsic-w="2000" data-intrinsic-h="1500" />';
    document.body.appendChild(root);

    const img = root.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 2000, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 1500, configurable: true });
    Object.defineProperty(img, "complete", { value: true, configurable: true });

    const unbind = bindLoadableImages(root);
    await new Promise((r) => requestAnimationFrame(r));

    expect(parseWidthPx(img)).toBe(240);
    expect(img.style.width).toBe("240px");
    const wrap = img.closest(".task-inline-image-wrap");
    expect(wrap).toBeTruthy();
    expect((wrap as HTMLElement).style.width).toBe("240px");

    unbind();
  });

  it("applies persisted width with SimpleRichTextView classes", async () => {
    root = document.createElement("div");
    root.className =
      "simple-rich-text cursor-default collapsible-lines-5 break-words px-3 py-2 text-sm leading-relaxed text-slate-800";
    root.dataset.richTextEditable = "false";
    root.innerHTML =
      '<img src="https://example.com/photo.jpg" alt="x" class="task-inline-image" style="width: 240px" data-intrinsic-w="2000" data-intrinsic-h="1500" />';
    document.body.appendChild(root);

    const img = root.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 2000, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 1500, configurable: true });
    Object.defineProperty(img, "complete", { value: true, configurable: true });

    const unbind = bindLoadableImages(root);
    await new Promise((r) => requestAnimationFrame(r));

    expect(img.style.width).toBe("240px");

    unbind();
  });

  it("without persisted width, uses capped inline display size", async () => {
    root = document.createElement("div");
    root.className = "simple-rich-text";
    root.style.width = "400px";
    root.dataset.richTextEditable = "false";
    root.innerHTML =
      '<img src="https://example.com/photo.jpg" alt="x" class="task-inline-image" data-intrinsic-w="2000" data-intrinsic-h="1500" />';
    document.body.appendChild(root);

    const img = root.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 2000, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 1500, configurable: true });
    Object.defineProperty(img, "complete", { value: true, configurable: true });

    const unbind = bindLoadableImages(root);
    await new Promise((r) => requestAnimationFrame(r));

    const wrap = img.closest(".task-inline-image-wrap") as HTMLElement;
    const wrapWidth = Number.parseFloat(wrap.style.width);
    expect(wrapWidth).toBeGreaterThan(0);
    expect(wrapWidth).toBeLessThan(2000);

    unbind();
  });

  it("reads width from wrapper when img has none", async () => {
    root = document.createElement("div");
    root.className = "simple-rich-text";
    root.innerHTML =
      '<span class="task-inline-image-wrap loadable-media-shell" style="width: 240px"><img src="https://example.com/photo.jpg" alt="x" class="task-inline-image" data-intrinsic-w="2000" data-intrinsic-h="1500" /></span>';
    document.body.appendChild(root);

    const img = root.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 2000, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 1500, configurable: true });
    Object.defineProperty(img, "complete", { value: true, configurable: true });

    expect(parseWidthPx(img)).toBe(240);

    const unbind = bindLoadableImages(root);
    await new Promise((r) => requestAnimationFrame(r));

    expect(img.style.width).toBe("240px");

    unbind();
  });

  it("syncPersistedInlineMediaWidths copies wrapper width onto img before save", () => {
    root = document.createElement("div");
    root.innerHTML =
      '<span class="task-inline-image-wrap" style="width: 180px"><img class="task-inline-image" src="https://example.com/x.jpg" /></span>';
    document.body.appendChild(root);

    syncPersistedInlineMediaWidths(root);
    const img = root.querySelector("img")!;
    expect(img.style.width).toBe("180px");
  });
});
