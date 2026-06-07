import { RICH_TEXT_HIGHLIGHT_COLOR } from "./richTextHighlight";

/** Allowed inline HTML for task updates — bold, underline, highlight, author spans. */
const AUTHOR_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const IMG_WIDTH_PX = /^(\d+(?:\.\d+)?)px$/i;
const MIN_IMG_WIDTH = 48;
const MAX_IMG_WIDTH = 800;

function sanitizeImgWidthPx(el: HTMLElement): string {
  const raw = (el.style.width || el.getAttribute("width") || "").trim();
  const m = IMG_WIDTH_PX.exec(raw);
  if (!m) return "";
  const n = Math.min(MAX_IMG_WIDTH, Math.max(MIN_IMG_WIDTH, Math.round(Number(m[1]))));
  return ` style="width: ${n}px"`;
}

export function sanitizeTaskUpdates(html: string): string {
  const raw = html.trim();
  if (!raw) return "";

  if (typeof DOMParser === "undefined") {
    return raw.replace(/<[^>]+>/g, "");
  }

  const doc = new DOMParser().parseFromString(raw, "text/html");

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (el.hasAttribute("data-inline-img-delete") || el.hasAttribute("data-inline-img-resize")) {
      return "";
    }

    const inner = [...el.childNodes].map(walk).join("");

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
        return media.map((node) => walk(node)).join("");
      }
      if (el.classList.contains("task-inline-file-ui")) return inner;
      if (el.classList.contains("task-inline-audio-ui")) return "";
      if (el.classList.contains("task-inline-video-controls")) return "";
      if (el.classList.contains("task-inline-video-speed")) return "";
      if (el.classList.contains("task-inline-video-speed-menu")) return "";
      const author = el.getAttribute("data-author")?.trim() ?? "";
      if (author && AUTHOR_ID.test(author)) {
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
      const pathAttr = storagePath
        ? ` data-storage-path="${storagePath.replace(/"/g, "&quot;")}"`
        : "";
      const fp = el.getAttribute("data-file-fp")?.trim() ?? "";
      const fpAttr = fp ? ` data-file-fp="${fp.replace(/"/g, "&quot;")}"` : "";
      const widthAttr = sanitizeImgWidthPx(el);
      return `<img src="${src.replace(/"/g, "&quot;")}" alt="${alt}" class="task-inline-image"${pathAttr}${fpAttr}${widthAttr} />`;
    }
    if (tag === "video") {
      const src = el.getAttribute("src")?.trim() ?? "";
      if (!/^https:\/\//i.test(src)) return "";
      const storagePath = el.getAttribute("data-storage-path")?.trim() ?? "";
      const pathAttr = storagePath
        ? ` data-storage-path="${storagePath.replace(/"/g, "&quot;")}"`
        : "";
      const widthAttr = sanitizeImgWidthPx(el);
      const name = (el.getAttribute("data-name") ?? "").replace(/"/g, "&quot;");
      const nameAttr = name ? ` data-name="${name}"` : "";
      const fp = el.getAttribute("data-file-fp")?.trim() ?? "";
      const fpAttr = fp ? ` data-file-fp="${fp.replace(/"/g, "&quot;")}"` : "";
      return `<video src="${src.replace(/"/g, "&quot;")}" class="task-inline-video"${pathAttr}${nameAttr}${fpAttr}${widthAttr} preload="metadata" playsinline disablePictureInPicture></video>`;
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
    if (tag === "a") {
      const href = el.getAttribute("href")?.trim() ?? "";
      if (!/^https:\/\//i.test(href)) return "";
      if (!el.classList.contains("task-inline-file")) return inner;
      const storagePath = el.getAttribute("data-storage-path")?.trim() ?? "";
      const pathAttr = storagePath
        ? ` data-storage-path="${storagePath.replace(/"/g, "&quot;")}"`
        : "";
      const name = (el.getAttribute("data-name") ?? el.textContent ?? "File").replace(/"/g, "&quot;");
      const fp = el.getAttribute("data-file-fp")?.trim() ?? "";
      const fpAttr = fp ? ` data-file-fp="${fp.replace(/"/g, "&quot;")}"` : "";
      const label = (el.textContent ?? name).replace(/</g, "").replace(/>/g, "");
      return `<a href="${href.replace(/"/g, "&quot;")}" class="task-inline-file"${pathAttr} data-name="${name}"${fpAttr} target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    if (tag === "div" || tag === "p" || tag === "body") return inner;
    return inner;
  }

  return walk(doc.body)
    .trim()
    .replace(/(<img[^>]*\/>)\s*×/gi, "$1");
}

export function taskUpdatesToPlainText(html: string): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").trim();
}

export function authorIdsInUpdates(html: string): string[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ids = new Set<string>();
  doc.querySelectorAll("[data-author]").forEach((el) => {
    const id = el.getAttribute("data-author")?.trim() ?? "";
    if (AUTHOR_ID.test(id)) ids.add(id);
  });
  return [...ids];
}
