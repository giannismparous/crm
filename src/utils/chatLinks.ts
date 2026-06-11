const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  return [...new Set(matches.map((u) => u.replace(/[.,;:!?)]+$/, "").trim()).filter(Boolean))];
}

/** Split plain text into link / non-link segments for rendering. */
export function linkifySegments(text: string): Array<{ type: "text" | "link"; value: string }> {
  if (!text.trim()) return [];
  const segments: Array<{ type: "text" | "link"; value: string }> = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", value: text.slice(last, match.index) });
    }
    const url = match[0].replace(/[.,;:!?)]+$/, "");
    segments.push({ type: "link", value: url });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}
