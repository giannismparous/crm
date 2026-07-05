import { isOrgStoragePath } from "./imageAttachments";
import { linkifySegments } from "./chatLinks";
import { normalizeHtmlEntities, repairCorruptedUrlRunsInText } from "./repairCorruptedUrls";
import { readWidthRaw } from "./mediaPlaceholder";
import { RICH_TEXT_HIGHLIGHT_COLOR } from "./richTextHighlight";

function safeStoragePathAttr(raw: string): string {
  const path = raw.trim();
  if (!path || !isOrgStoragePath(path)) return "";
  return ` data-storage-path="${path.replace(/"/g, "&quot;")}"`;
}

/** Allowed inline HTML for task updates — bold, underline, highlight, author spans. */
const AUTHOR_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const IMG_WIDTH_PX = /^(\d+(?:\.\d+)?)px$/i;
const MIN_IMG_WIDTH = 48;
const MAX_IMG_WIDTH = 800;

const BLOCK_TAGS = new Set([
  "div",
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "section",
  "article",
]);

function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag);
}

/** Invisible chars contenteditable leaves behind (author caret markers, BOM). */
function stripInvisibleChars(text: string): string {
  return text.replace(/[\u200b\ufeff]/g, "");
}

function hasInlineMediaMarkup(html: string): boolean {
  return /<(?:img|video|audio|a)\s[^>]*class="task-inline-/i.test(html);
}

/** True when a serialized segment is only breaks, nbsp, or empty author spans. */
function isBlankSegment(segment: string): boolean {
  const plain = stripInvisibleChars(
    segment
      .replace(/<br\s*\/?>/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/<span[^>]*data-author="[^"]*"[^>]*>[\s\S]*?<\/span>/gi, (m) => {
        const inner = m.replace(/<[^>]+>/g, "");
        return stripInvisibleChars(inner).trim() ? m : "";
      })
      .replace(/<[^>]+>/g, "")
  ).trim();
  return !plain;
}

const MAX_CONSECUTIVE_BR = 10;
const REPAIR_BR_THRESHOLD = 40;

function countBrTags(html: string): number {
  return (html.match(/<br\s*\/?>/gi) || []).length;
}

/** Collapse runaway blank lines (corrupt saves) while keeping intentional gaps. */
function capConsecutiveBreaks(html: string, aggressive = false): string {
  const maxRun = aggressive ? 2 : MAX_CONSECUTIVE_BR;
  const minRun = maxRun + 1;
  return html.replace(new RegExp(`(?:<br\\s*/?>){${minRun},}`, "gi"), "<br>".repeat(maxRun));
}

function normalizeSerializedHtml(html: string): string {
  if (!html) return "";

  let out = stripInvisibleChars(html)
    .replace(/<span data-author="[^"]*"><\/span>/gi, "")
    .replace(/<span data-author="[^"]*">\s*<\/span>/gi, "")
    // Keep line breaks inside author spans (empty lines are intentional).
    .replace(
      /<span data-author="([^"]*)">((?:<br\s*\/?>)*)<\/span>/gi,
      (_, id: string, inner: string) => {
        const brs = inner.match(/<br\s*\/?>/gi);
        if (!brs?.length) return "";
        return `<span data-author="${id}">${brs.join("")}</span>`;
      }
    );

  out = out.replace(/^(<br\s*\/?>)+/i, "");

  out = capConsecutiveBreaks(out, countBrTags(out) > REPAIR_BR_THRESHOLD);

  out = out.trim();
  if (!out) return "";

  const plain = taskUpdatesToPlainText(out).replace(/\s/g, "");
  if (!plain && !hasInlineMediaMarkup(out)) return "";

  return out;
}

function sanitizeImgWidthPx(el: HTMLElement): string {
  let raw = readWidthRaw(el);
  if (!raw) {
    const wrap = el.closest(".task-inline-image-wrap, .loadable-media-shell, .task-inline-video-wrap");
    if (wrap) raw = readWidthRaw(wrap as HTMLElement);
  }
  const m = IMG_WIDTH_PX.exec(raw);
  if (!m) return "";
  const n = Math.min(MAX_IMG_WIDTH, Math.max(MIN_IMG_WIDTH, Math.round(Number(m[1]))));
  return ` style="width: ${n}px"`;
}

function sanitizeMediaIntrinsic(el: HTMLImageElement | HTMLVideoElement): string {
  let w = el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth;
  let h = el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight;
  if (w <= 0 || h <= 0) {
    w = Number.parseInt(el.getAttribute("data-intrinsic-w") ?? "", 10);
    h = Number.parseInt(el.getAttribute("data-intrinsic-h") ?? "", 10);
  }
  if (w <= 0 || h <= 0) return "";
  return ` data-intrinsic-w="${w}" data-intrinsic-h="${h}"`;
}

function collapseRepeatedSubstring(text: string, piece: string): string {
  if (!piece || piece.length < 8) return text;
  let out = text;
  const doubled = piece + piece;
  while (out.includes(doubled)) {
    out = out.split(doubled).join(piece);
  }
  return out;
}

function plainTextForLinkLabel(href: string, labelPlain: string): string {
  const stripped = stripInvisibleChars(labelPlain.replace(/<[^>]+>/g, ""));
  const collapsed = repairCorruptedUrlRunsInText(stripped);
  if (collapsed.trim() === href || collapsed.includes(href)) {
    return collapseRepeatedSubstring(collapsed, href).trim() || href;
  }
  return collapsed.trim() || href;
}

/** Fix corrupt research/task notes where link labels grew from repeated re-linkify on save. */
export function repairDuplicatedLinksInHtml(html: string): string {
  const raw = stripInvisibleChars(String(html ?? "").trim());
  if (!raw || typeof DOMParser === "undefined") return repairCorruptedUrlRunsInText(raw);

  if (!looksLikeHtml(raw)) {
    return repairCorruptedUrlRunsInText(raw);
  }

  const doc = new DOMParser().parseFromString(raw, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    const before = textNode.textContent ?? "";
    const after = repairCorruptedUrlRunsInText(normalizeHtmlEntities(before));
    if (after !== before) textNode.textContent = after;
  }

  doc.querySelectorAll("a").forEach((node) => {
    const el = node as HTMLAnchorElement;
    if (el.classList.contains("task-inline-file")) return;
    const hrefRaw = el.getAttribute("href")?.trim() ?? "";
    const href = normalizeHtmlEntities(hrefRaw);
    if (href !== hrefRaw) el.setAttribute("href", href);
    if (!isSafeHttpUrl(href)) return;
    el.querySelectorAll("a").forEach((nested) => {
      nested.replaceWith(document.createTextNode(nested.textContent ?? ""));
    });
    el.textContent = plainTextForLinkLabel(href, el.textContent ?? "");
  });

  for (let pass = 0; pass < 32; pass++) {
    let removed = false;
    doc.querySelectorAll("a[href]").forEach((node) => {
      const el = node as HTMLAnchorElement;
      if (el.classList.contains("task-inline-file")) return;
      const href = normalizeHtmlEntities(el.getAttribute("href")?.trim() ?? "");
      if (!isSafeHttpUrl(href)) return;
      let sib = el.nextSibling;
      while (sib) {
        if (sib.nodeType !== Node.ELEMENT_NODE) break;
        const next = sib as HTMLAnchorElement;
        if (next.tagName !== "A" || next.classList.contains("task-inline-file")) break;
        if (normalizeHtmlEntities(next.getAttribute("href")?.trim() ?? "") !== href) break;
        const toRemove = sib;
        sib = sib.nextSibling;
        toRemove.remove();
        removed = true;
      }
    });
    if (!removed) break;
  }

  return doc.body.innerHTML;
}

function walkInline(node: Node, insideAnchor = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (insideAnchor) return escapeHtmlText(stripInvisibleChars(text));
    return linkifyTextToHtml(text);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (el.hasAttribute("data-inline-img-delete") || el.hasAttribute("data-inline-img-resize")) {
    return "";
  }

  if (isBlockTag(tag)) {
    return walkBlockContent(el);
  }

  if (tag === "a") {
    if (insideAnchor) {
      return escapeHtmlText(stripInvisibleChars(el.textContent ?? ""));
    }
    const href = normalizeHtmlEntities(el.getAttribute("href")?.trim() ?? "");
    const innerPlain = [...el.childNodes].map((child) => walkInline(child, true)).join("");
    if (!isSafeHttpUrl(href)) return innerPlain;
    if (el.classList.contains("task-inline-file")) {
      const storagePath = el.getAttribute("data-storage-path")?.trim() ?? "";
      const pathAttr = safeStoragePathAttr(storagePath);
      const name = (el.getAttribute("data-name") ?? el.textContent ?? "File").replace(/"/g, "&quot;");
      const fp = el.getAttribute("data-file-fp")?.trim() ?? "";
      const fpAttr = fp ? ` data-file-fp="${fp.replace(/"/g, "&quot;")}"` : "";
      const label = plainTextForLinkLabel(href, innerPlain).replace(/</g, "").replace(/>/g, "");
      return `<a href="${escapeAttr(href)}" class="task-inline-file"${pathAttr} data-name="${name}"${fpAttr} target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return serializeExternalLink(href, innerPlain);
  }

  const inner = [...el.childNodes].map((child) => walkInline(child, insideAnchor)).join("");

  if (tag === "button") return "";
  if (tag === "b" || tag === "strong") return `<strong>${inner}</strong>`;
  if (tag === "u") return `<u>${inner}</u>`;
  if (tag === "br") return "<br>";
  if (tag === "mark") return `<span style="background-color: ${RICH_TEXT_HIGHLIGHT_COLOR}">${inner}</span>`;
  if (tag === "span" || tag === "font") {
    if (
      el.classList.contains("task-inline-image-wrap") ||
      el.classList.contains("task-inline-video-wrap") ||
      el.classList.contains("task-inline-audio-wrap") ||
      el.classList.contains("task-inline-file-wrap")
    ) {
      if (el.hasAttribute("data-uploading")) return "";
      const media = [
        ...el.querySelectorAll("img.task-inline-image"),
        ...el.querySelectorAll("video.task-inline-video"),
        ...el.querySelectorAll("audio.task-inline-audio"),
        ...el.querySelectorAll("a.task-inline-file"),
      ];
      return media.map((node) => walkInline(node)).join("");
    }
    if (el.classList.contains("task-inline-file-ui")) return inner;
    if (el.classList.contains("task-inline-audio-ui")) return "";
    if (el.classList.contains("task-inline-video-controls")) return "";
    if (el.classList.contains("task-inline-video-speed")) return "";
    if (el.classList.contains("task-inline-video-speed-menu")) return "";
    const author = el.getAttribute("data-author")?.trim() ?? "";
    if (author && AUTHOR_ID.test(author)) {
      if (isBlankSegment(inner)) {
        const brs = inner.match(/<br\s*\/?>/gi);
        if (brs?.length) return `<span data-author="${author}">${brs.join("")}</span>`;
        return "";
      }
      return `<span data-author="${author}">${inner}</span>`;
    }
    const bg = el.style.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      return `<span style="background-color: ${RICH_TEXT_HIGHLIGHT_COLOR}">${inner}</span>`;
    }
    return inner;
  }
  if (tag === "img") {
    const src = el.getAttribute("src")?.trim() ?? "";
    if (!/^https:\/\//i.test(src)) return "";
    const storagePath = el.getAttribute("data-storage-path")?.trim() ?? "";
    const alt = (el.getAttribute("alt") ?? "Image").replace(/"/g, "&quot;");
    const pathAttr = safeStoragePathAttr(storagePath);
    const fp = el.getAttribute("data-file-fp")?.trim() ?? "";
    const fpAttr = fp ? ` data-file-fp="${fp.replace(/"/g, "&quot;")}"` : "";
    const widthAttr = sanitizeImgWidthPx(el);
    const intrinsicAttr = sanitizeMediaIntrinsic(el as HTMLImageElement);
    return `<img src="${src.replace(/"/g, "&quot;")}" alt="${alt}" class="task-inline-image"${pathAttr}${fpAttr}${intrinsicAttr}${widthAttr} />`;
  }
  if (tag === "video") {
    const src = el.getAttribute("src")?.trim() ?? "";
    if (!/^https:\/\//i.test(src)) return "";
    const storagePath = el.getAttribute("data-storage-path")?.trim() ?? "";
    const pathAttr = safeStoragePathAttr(storagePath);
    const widthAttr = sanitizeImgWidthPx(el);
    const intrinsicAttr = sanitizeMediaIntrinsic(el as HTMLVideoElement);
    const name = (el.getAttribute("data-name") ?? "").replace(/"/g, "&quot;");
    const nameAttr = name ? ` data-name="${name}"` : "";
    const fp = el.getAttribute("data-file-fp")?.trim() ?? "";
    const fpAttr = fp ? ` data-file-fp="${fp.replace(/"/g, "&quot;")}"` : "";
    return `<video src="${src.replace(/"/g, "&quot;")}" class="task-inline-video"${pathAttr}${nameAttr}${fpAttr}${intrinsicAttr}${widthAttr} preload="metadata" playsinline disablePictureInPicture></video>`;
  }
  if (tag === "audio") {
    const src = el.getAttribute("src")?.trim() ?? "";
    if (!/^https:\/\//i.test(src)) return "";
    const storagePath = el.getAttribute("data-storage-path")?.trim() ?? "";
    const pathAttr = storagePath
      ? ` data-storage-path="${storagePath.replace(/"/g, "&quot;")}"`
      : "";
    const name = (el.getAttribute("data-name") ?? "Audio").replace(/"/g, "&quot;");
    const fp = el.getAttribute("data-file-fp")?.trim() ?? "";
    const fpAttr = fp ? ` data-file-fp="${fp.replace(/"/g, "&quot;")}"` : "";
    return `<audio src="${src.replace(/"/g, "&quot;")}" class="task-inline-audio"${pathAttr} data-name="${name}"${fpAttr} preload="metadata"></audio>`;
  }
  return inner;
}

/** Serialize one block element's children (no extra line break after the block). */
function walkBlockContent(el: HTMLElement): string {
  const parts: string[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName.toLowerCase();
      if (isBlockTag(tag)) {
        parts.push(walkBlockContent(child as HTMLElement));
      } else {
        parts.push(walkInline(child));
      }
    } else {
      parts.push(walkInline(child));
    }
  }
  return parts.join("");
}

/** Serialize body children — `<br>` only between block elements, never doubled with inline breaks. */
function walkBlockChildren(nodes: Iterable<Node>): string {
  const out: string[] = [];
  for (const child of nodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = walkInline(child);
      if (text) out.push(text);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (isBlockTag(tag)) {
      const block = walkBlockContent(el);
      const hasMedia = el.querySelector("img, video, audio, a.task-inline-file");
      if (block) {
        if (out.length > 0) out.push("<br>");
        out.push(block);
      } else if (!hasMedia && out.length > 0) {
        out.push("<br>");
      }
      continue;
    }

    const inline = walkInline(child);
    if (inline) out.push(inline);
  }
  return out.join("");
}

export function sanitizeTaskUpdates(html: string): string {
  const raw = html.trim();
  if (!raw) return "";

  if (typeof DOMParser === "undefined") {
    const plain = stripInvisibleChars(raw.replace(/<[^>]+>/g, "")).trim();
    return plain;
  }

  const doc = new DOMParser().parseFromString(raw, "text/html");

  const serialized = walkBlockChildren(doc.body.childNodes)
    .replace(/(<img[^>]*\/>)\s*×/gi, "$1");

  return normalizeSerializedHtml(serialized);
}

function nodeToPlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return stripInvisibleChars(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (isBlockTag(tag)) {
    const inner = [...el.childNodes].map(nodeToPlainText).join("");
    return inner.endsWith("\n") ? inner : `${inner}\n`;
  }
  return [...el.childNodes].map(nodeToPlainText).join("");
}

export function taskUpdatesToPlainText(html: string): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.body.childNodes]
    .map(nodeToPlainText)
    .join("")
    .replace(/\n+$/, "")
    .trim();
}

function escapeHtmlText(text: string): string {
  const plain = normalizeHtmlEntities(text);
  return plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  const plain = normalizeHtmlEntities(text);
  return plain.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function isSafeHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

/** Turn plain-text URLs into safe external links. */
export function linkifyTextToHtml(raw: string): string {
  const text = normalizeHtmlEntities(stripInvisibleChars(raw));
  if (!text) return "";
  const segments = linkifySegments(text);
  return segments
    .map((seg) => {
      if (seg.type === "link" && isSafeHttpUrl(seg.value)) {
        const href = escapeAttr(seg.value);
        const label = escapeHtmlText(seg.value);
        return `<a href="${href}" class="rich-text-link" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
      return escapeHtmlText(seg.value);
    })
    .join("");
}

function serializeExternalLink(href: string, labelPlain: string): string {
  if (!isSafeHttpUrl(href)) return escapeHtmlText(labelPlain);
  const label = plainTextForLinkLabel(href, labelPlain);
  return `<a href="${escapeAttr(href)}" class="rich-text-link" target="_blank" rel="noopener noreferrer">${escapeHtmlText(label)}</a>`;
}

export function looksLikeHtml(body: string): boolean {
  return /<[a-z][\s\S]*>/i.test(body);
}

/** Fix corrupt / legacy description & rich text before display or save. */
export function repairRichTextBody(body: string): string {
  let raw = stripInvisibleChars(String(body ?? "").trim());
  if (!raw) return "";

  raw = repairDuplicatedLinksInHtml(raw);

  // Literal escaped breaks saved as text — turn back into real markup.
  if (/&lt;br\s*\/?&gt;/i.test(raw)) {
    raw = raw.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  }

  const aggressive = countBrTags(raw) > REPAIR_BR_THRESHOLD || raw.length > 20_000;
  if (aggressive) {
    raw = capConsecutiveBreaks(raw, true);
  }

  if (!looksLikeHtml(raw)) {
    return capConsecutiveBreaks(
      raw
        .split("\n")
        .map((line) => linkifyTextToHtml(line))
        .join("<br>"),
      aggressive
    );
  }

  return sanitizeTaskUpdates(raw);
}

/** Plain legacy text or stored rich HTML → value for SimpleRichText. */
export function richTextEditorValue(body: string): string {
  return repairRichTextBody(body);
}

/** Stored description/updates → plain text for search and labels. */
export function richTextToPlainText(body: string): string {
  const raw = (body ?? "").trim();
  if (!raw) return "";
  if (looksLikeHtml(raw)) return taskUpdatesToPlainText(sanitizeTaskUpdates(raw));
  return raw;
}

export function authorIdsInUpdates(html: string): string[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ids = new Set<string>();
  doc.querySelectorAll("[data-author]").forEach((el) => {
    const id = el.getAttribute("data-author")?.trim() ?? "";
    if (!AUTHOR_ID.test(id)) return;
    const plain = taskUpdatesToPlainText(el.innerHTML).trim();
    const hasMedia = el.querySelector("img, video, audio, a[href], .rich-text-media");
    if (!plain && !hasMedia) return;
    ids.add(id);
  });
  return [...ids];
}
