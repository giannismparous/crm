/** Collapse back-to-back duplicated URLs in research notes and rich text. */

function stripInvisible(text: string): string {
  return text.replace(/[\u200b\ufeff]/g, "");
}

/** Decode `&amp;amp;…` chains back to plain text (safe to run repeatedly). */
export function normalizeHtmlEntities(text: string): string {
  let out = stripInvisible(text);
  if (!out) return out;

  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/gi, " ");
  }

  return out;
}

function extractHttpUrlAt(s: string): string {
  const m = s.match(/^https?:\/\/[^\s<>"']+/i);
  if (!m) return "";
  let url = m[0];
  while (url.endsWith("-") && s.length > url.length && /\s/.test(s[url.length] ?? "")) {
    url = url.slice(0, -1);
  }
  return url;
}
function sameUrlDuplicate(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (ua.hostname.replace(/^www\./, "") !== ub.hostname.replace(/^www\./, "")) return false;
    const pa = ua.pathname.replace(/\/$/, "");
    const pb = ub.pathname.replace(/\/$/, "");
    return pa === pb || pa.startsWith(pb) || pb.startsWith(pa);
  } catch {
    return false;
  }
}

/** Skip a second copy of the same link pasted right after the first (often truncated). */
function skipTrailingPartialUrlDuplicate(canonical: string, remainder: string): number {
  const tail = remainder.trimStart();
  const url = extractHttpUrlAt(tail);
  if (!url || !sameUrlDuplicate(canonical, url)) return 0;
  return remainder.length - tail.length + url.length;
}

/** At `s[0]` (must start with http), return one canonical URL and how many chars to skip. */
export function collapseHttpRepeatsAt(s: string): { text: string; skip: number } {
  if (!/^https?:\/\//i.test(s)) return { text: "", skip: 0 };

  const maxPeriod = Math.min(600, Math.floor(s.length / 2));
  let bestEnd = 0;
  let bestUnit = "";

  for (let period = 10; period <= maxPeriod; period++) {
    const unit = s.slice(0, period);
    if (!unit.includes("://")) continue;
    let end = 0;
    while (end + period <= s.length && s.slice(end, end + period) === unit) {
      end += period;
    }
    if (end >= period * 2 && end > bestEnd) {
      bestEnd = end;
      bestUnit = unit;
    }
  }

  if (bestUnit) return { text: bestUnit, skip: bestEnd };

  for (let len = Math.min(600, s.length); len >= 12; len--) {
    const prefix = s.slice(0, len);
    if (!prefix.includes("://")) continue;
    if (s.indexOf(prefix, len) !== len) continue;
    let end = len;
    while (s.indexOf(prefix, end) === end) end += len;
    return { text: prefix, skip: end };
  }

  for (let len = 12; len <= Math.min(600, s.length); len++) {
    const prefix = s.slice(0, len);
    if (!prefix.includes("://")) continue;
    if (s.indexOf(prefix, len) === len) return { text: prefix, skip: len };
  }

  const innerHttpRel = s.slice(12).search(/https?:\/\//i);
  if (innerHttpRel >= 0) {
    const pos = 12 + innerHttpRel;
    const first = s.slice(0, pos);
    const url = extractHttpUrlAt(s.slice(pos));
    if (url && sameUrlDuplicate(first, url)) {
      return { text: first, skip: pos + url.length };
    }
  }

  let cut = s.length;
  for (let pos = 12; pos < s.length; pos++) {
    if (!/^https?:\/\//i.test(s.slice(pos))) continue;
    const prefix = s.slice(0, pos);
    if (prefix.includes("://") && s.startsWith(prefix, pos)) {
      cut = pos;
      break;
    }
  }

  const noteBreak = s.slice(0, cut).search(/ - /);
  if (noteBreak > 12) cut = Math.min(cut, noteBreak);

  return { text: s.slice(0, cut), skip: cut };
}

/** Repair concatenated duplicate URLs inside longer notes (preserves surrounding text). */
export function repairCorruptedUrlRunsInText(text: string): string {
  const input = normalizeHtmlEntities(stripInvisible(text));
  if (!input) return input;

  let out = "";
  let i = 0;
  while (i < input.length) {
    const rel = input.slice(i).search(/https?:\/\//i);
    if (rel === -1) {
      out += input.slice(i);
      break;
    }
    const at = i + rel;
    out += input.slice(i, at);
    const tail = input.slice(at);
    const { text: chunk, skip } = collapseHttpRepeatsAt(tail);
    if (skip > 0) {
      out += chunk;
      const after = input.slice(at + skip);
      const dupSkip = skipTrailingPartialUrlDuplicate(chunk, after);
      i = at + skip + dupSkip;
    } else {
      out += tail.slice(0, 1);
      i = at + 1;
    }
  }
  return out;
}
