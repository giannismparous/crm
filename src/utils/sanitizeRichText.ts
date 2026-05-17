/** Allowed inline HTML for task updates — bold, underline, highlight, author spans. */
const AUTHOR_ID = /^[a-zA-Z0-9_-]{1,64}$/;

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
    const inner = [...el.childNodes].map(walk).join("");

    if (tag === "b" || tag === "strong") return `<strong>${inner}</strong>`;
    if (tag === "u") return `<u>${inner}</u>`;
    if (tag === "br") return "<br>";
    if (tag === "mark") return `<span style="background-color: #fef9c3">${inner}</span>`;
    if (tag === "span" || tag === "font") {
      const author = el.getAttribute("data-author")?.trim() ?? "";
      if (author && AUTHOR_ID.test(author)) {
        return `<span data-author="${author}">${inner}</span>`;
      }
      const bg = el.style.backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
        return `<span style="background-color: #fef9c3">${inner}</span>`;
      }
      return inner;
    }
    if (tag === "div" || tag === "p" || tag === "body") return inner;
    return inner;
  }

  return walk(doc.body).trim();
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
