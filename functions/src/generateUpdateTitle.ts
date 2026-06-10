import { HttpsError } from "firebase-functions/v2/https";
import { geminiApiKey } from "./config";

const MODEL_ID = "gemini-2.5-flash-lite";
const MAX_TITLE_LEN = 55;
const MAX_WORDS = 6;

export type TitleLanguage = "greek" | "english";

export type GenerateUpdateTitleInput = {
  taskTitle?: string;
  projectName?: string;
  taskDescription?: string;
  previousUpdates?: { title?: string; body?: string }[];
  newUpdateBody?: string;
  titleLanguage?: TitleLanguage;
  isGreeklish?: boolean;
};

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
}

function isLikelyTitleCompression(title: string, bodyPlain: string): boolean {
  const t = title.trim();
  const b = bodyPlain.trim();
  if (!t || !b) return false;
  if (t.length >= b.length * 0.9) return false;
  if (b.toLowerCase().startsWith(t.toLowerCase()) && t.length > 20) return false;
  return t.split(/\s+/).length <= MAX_WORDS;
}

export function isTitleGroundedInUpdate(title: string, bodyPlain: string): boolean {
  const titleNorm = title.replace(/\s+/g, " ").trim();
  const bodyNorm = bodyPlain.replace(/\s+/g, " ").trim();
  if (!titleNorm || !bodyNorm) return false;

  const bodyLower = bodyNorm.toLowerCase();
  const titleLower = titleNorm.toLowerCase();
  if (bodyLower.includes(titleLower) || titleLower.includes(bodyLower.slice(0, Math.min(bodyLower.length, titleLower.length + 8)))) {
    return true;
  }

  const titleWords = normalizeWords(titleNorm);
  const bodyWords = new Set(normalizeWords(bodyNorm));
  if (titleWords.some((word) => bodyWords.has(word))) return true;

  const bodyJoined = normalizeWords(bodyNorm).join(" ");
  const titleJoined = normalizeWords(titleNorm).join(" ");
  const rejectionHints = ["απορριψ", "reject", "declin"];
  const hireHints = ["προσλαβ", "προσληψ", "hire"];
  if (rejectionHints.some((h) => titleJoined.includes(h)) && hireHints.some((h) => bodyJoined.includes(h))) {
    return true;
  }

  return isLikelyTitleCompression(titleNorm, bodyNorm);
}

export function isUnnaturalTitle(title: string, bodyPlain: string): boolean {
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (!trimmed) return true;

  const commaCount = (trimmed.match(/,/g) ?? []).length;
  if (commaCount >= 2) return true;
  if (commaCount >= 1 && trimmed.split(/\s+/).length >= 5) return true;

  if (/όχι\s+(την?\s+)?πρόσληψη/i.test(trimmed)) return true;
  if (/,\s*όχι\s+/i.test(trimmed)) return true;

  const greekChars = (bodyPlain.match(/[\u0370-\u03FF]/g) ?? []).length;
  const latinChars = (bodyPlain.match(/[a-zA-Z]/g) ?? []).length;
  if (greekChars > latinChars && /[α-ω]{3,}/i.test(trimmed) && !/[άέήίόύώ]/i.test(trimmed)) {
    return true;
  }

  const bodyNorm = bodyPlain.replace(/\s+/g, " ").trim().toLowerCase();
  const titleNorm = trimmed.toLowerCase();
  if (bodyNorm.startsWith(titleNorm) && titleNorm.length >= bodyNorm.length * 0.75) {
    return true;
  }

  return false;
}

function sanitizeGeneratedTitle(raw: string): string {
  let title = raw
    .replace(/^[\s"'`«»„“]+|[\s"'`«»„“]+$/g, "")
    .replace(/^title\s*:\s*/i, "")
    .replace(/^τίτλος\s*:\s*/i, "")
    .split(/\r?\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim() ?? "";

  if (!title) return "";

  const words = title.split(/\s+/);
  if (words.length > MAX_WORDS) {
    title = words.slice(0, MAX_WORDS).join(" ");
  }
  if (title.length > MAX_TITLE_LEN) {
    title = `${title.slice(0, MAX_TITLE_LEN - 1).trimEnd()}…`;
  }
  return title;
}

export function fallbackTitle(bodyPlain: string): string {
  const plain = bodyPlain.replace(/\s+/g, " ").trim();
  if (!plain) return "Media update";
  const words = plain.split(/\s+/).slice(0, MAX_WORDS);
  let title = words.join(" ");
  if (title.length > MAX_TITLE_LEN) {
    title = `${title.slice(0, MAX_TITLE_LEN - 1).trimEnd()}…`;
  }
  return title || "Progress update";
}

function languageStyleBlock(input: GenerateUpdateTitleInput): string {
  const lang: TitleLanguage = input.titleLanguage === "greek" ? "greek" : "english";
  const greeklish = Boolean(input.isGreeklish);

  if (lang === "greek") {
    return `Output language: Greek (Ελληνικά) only.
- Natural Greek a colleague would write — correct τόνοι, no AI comma lists.
- If someone is not being hired: "απόρριψη" / "δεν προχωρά" — NOT "όχι πρόσληψη".
${greeklish ? "- NEW UPDATE is Greeklish (Greek in Latin letters): understand it and write the title in proper Greek." : ""}
${!greeklish ? "- If NEW UPDATE is in English but this task uses Greek elsewhere, still write the title in Greek." : ""}
- One short phrase (max ${MAX_WORDS} words), e.g. "Απόρριψη μετά από δοκιμαστική".`;
  }

  return `Output language: English only.
- Natural concise English — not a keyword list or copy-paste of the update.
- Compress the meaning into one short phrase (max ${MAX_WORDS} words).`;
}

function buildPrompt(input: GenerateUpdateTitleInput, rejectedTitle?: string): string {
  const newUpdateBody = clip(input.newUpdateBody ?? "", 4000);
  const style = languageStyleBlock(input);
  const retryBlock = rejectedTitle
    ? `\nPrevious title was rejected: "${rejectedTitle}". Write a better single phrase.\n`
    : "";

  return `Write a very short CRM update title.

${style}
${retryBlock}
Rules:
- Summarize ONLY what NEW UPDATE says — shorter, same meaning.
- Do NOT invent topics from the task or project.
- Output ONLY the title. No quotes.

NEW UPDATE:
${newUpdateBody || "(empty)"}`;
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "You write brief, natural CRM update titles in the requested language. Never comma lists or robotic summaries.",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 24,
        candidateCount: 1,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Gemini generateUpdateTitle failed", response.status, detail.slice(0, 500));
    throw new HttpsError("internal", "Could not generate update title.");
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function acceptTitle(title: string, body: string): string | null {
  const sanitized = sanitizeGeneratedTitle(title);
  if (!sanitized) return null;
  if (isUnnaturalTitle(sanitized, body)) return null;
  if (!isTitleGroundedInUpdate(sanitized, body)) return null;
  return sanitized;
}

export async function generateUpdateTitleWithGemini(input: GenerateUpdateTitleInput): Promise<string> {
  const newBody = clip(input.newUpdateBody ?? "", 4000);
  if (!newBody) return "Media update";

  const apiKey = geminiApiKey.value()?.trim();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Gemini API key is not configured.");
  }

  const firstRaw = await callGemini(apiKey, buildPrompt(input));
  const first = acceptTitle(firstRaw, newBody);
  if (first) return first;

  const secondRaw = await callGemini(apiKey, buildPrompt(input, sanitizeGeneratedTitle(firstRaw) || firstRaw.slice(0, 80)));
  const second = acceptTitle(secondRaw, newBody);
  if (second) return second;

  return fallbackTitle(newBody);
}
