/**
 * One-time repair of duplicated URLs / entity bloat in Firestore research notes.
 *
 * Run from crm/: npm run repair:research-notes
 * Requires service-account.json (same as seed-firestore).
 */

const { loadServiceAccount } = require("./load-service-account.cjs");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { JSDOM } = require("jsdom");

const ORG_ID = "SimasiaAI";

function stripInvisible(text) {
  return text.replace(/[\u200b\ufeff]/g, "");
}

function normalizeHtmlEntities(text) {
  let out = stripInvisible(String(text ?? ""));
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

function extractHttpUrlAt(s) {
  const m = s.match(/^https?:\/\/[^\s<>"']+/i);
  if (!m) return "";
  let url = m[0];
  while (url.endsWith("-") && s.length > url.length && /\s/.test(s[url.length] ?? "")) {
    url = url.slice(0, -1);
  }
  return url;
}

function sameUrlDuplicate(a, b) {
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

function skipTrailingPartialUrlDuplicate(canonical, remainder) {
  const tail = remainder.trimStart();
  const url = extractHttpUrlAt(tail);
  if (!url || !sameUrlDuplicate(canonical, url)) return 0;
  return remainder.length - tail.length + url.length;
}

function collapseHttpRepeatsAt(s) {
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

function repairCorruptedUrlRunsInText(text) {
  const input = normalizeHtmlEntities(stripInvisible(String(text ?? "")));
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

function looksLikeHtml(body) {
  return /<[a-z][\s\S]*>/i.test(body);
}

function escapeAttr(text) {
  const plain = normalizeHtmlEntities(text);
  return plain.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function repairNotesBody(raw) {
  let text = stripInvisible(String(raw ?? "").trim());
  if (!text) return text;

  for (let pass = 0; pass < 12; pass++) {
    const before = text;
    if (looksLikeHtml(text)) {
      const dom = new JSDOM(`<body>${text}</body>`);
      const doc = dom.window.document;
      const walker = doc.createTreeWalker(doc.body, dom.window.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const repaired = repairCorruptedUrlRunsInText(node.textContent ?? "");
        if (repaired !== node.textContent) node.textContent = repaired;
      }
      doc.querySelectorAll("a").forEach((el) => {
        const hrefRaw = el.getAttribute("href")?.trim() ?? "";
        const href = normalizeHtmlEntities(hrefRaw);
        if (href !== hrefRaw) el.setAttribute("href", escapeAttr(href));
        if (!href.startsWith("http")) return;
        el.querySelectorAll("a").forEach((nested) => {
          nested.replaceWith(doc.createTextNode(nested.textContent ?? ""));
        });
        const label = repairCorruptedUrlRunsInText(el.textContent ?? "");
        el.textContent = label.trim() || href;
      });
      for (let mergePass = 0; mergePass < 32; mergePass++) {
        let removed = false;
        doc.querySelectorAll("a[href]").forEach((el) => {
          const href = normalizeHtmlEntities(el.getAttribute("href")?.trim() ?? "");
          if (!href.startsWith("http")) return;
          let sib = el.nextSibling;
          while (sib) {
            if (sib.nodeType !== 1) break;
            if (sib.tagName !== "A") break;
            const sibHref = normalizeHtmlEntities(sib.getAttribute("href")?.trim() ?? "");
            if (sibHref !== href) break;
            const toRemove = sib;
            sib = sib.nextSibling;
            toRemove.remove();
            removed = true;
          }
        });
        if (!removed) break;
      }
      text = doc.body.innerHTML;
    } else {
      text = repairCorruptedUrlRunsInText(text);
    }
    if (text === before) break;
  }
  return text;
}

function needsRepair(raw) {
  if (/&amp;amp;/i.test(raw)) return true;
  if (/<\/a>\s*<a\s[^>]*href="/i.test(raw)) return true;
  if (/https?:\/\/[^\s]+https?:\/\//i.test(normalizeHtmlEntities(raw))) return true;
  return false;
}

async function main() {
  const sa = loadServiceAccount();
  if (getApps().length === 0) {
    initializeApp({ credential: cert(sa) });
  }
  const db = getFirestore();
  const snap = await db.collection(`organizations/${ORG_ID}/research`).get();
  let updated = 0;

  for (const doc of snap.docs) {
    const raw = String(doc.data().notes ?? "");
    if (!raw.trim()) continue;
    if (!needsRepair(raw)) continue;
    const cleaned = repairNotesBody(raw);
    if (cleaned === raw) continue;
    await doc.ref.update({
      notes: cleaned,
      updatedAt: new Date().toISOString(),
    });
    updated += 1;
    console.log(
      `repaired ${doc.id} (${doc.data().title ?? "untitled"}): ${raw.length} → ${cleaned.length} chars`
    );
  }

  console.log(updated === 0 ? "No research notes needed repair." : `Repaired ${updated} research item(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
