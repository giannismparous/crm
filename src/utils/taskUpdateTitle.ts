import type { Person, Task } from "../types";
import { taskUpdatesToPlainText } from "./sanitizeRichText";
import { taskDescriptionContent } from "./taskUpdates";
import { taskUpdateEntries } from "./taskUpdateEntries";

export type TitleLanguage = "greek" | "english";

export type TaskUpdateTitleContext = {
  taskTitle: string;
  projectName: string;
  taskDescription: string;
  previousUpdates: { title: string; body: string }[];
  newUpdateBody: string;
  titleLanguage: TitleLanguage;
  isGreeklish: boolean;
};

const MAX_TITLE_WORDS = 6;

function countGreekLetters(text: string): number {
  return (text.match(/[\u0370-\u03FF]/g) ?? []).length;
}

function countLatinLetters(text: string): number {
  return (text.match(/[a-zA-Z]/g) ?? []).length;
}

const GREEKLISH_WORD =
  /\b(kai|den|tha|na|mou|sou|tou|tis|ton|tin|apo|gia|oti|pou|me|se|einai|eimai|polu|ligo|kalos|kali|kalh|sunant|simant|ergasia|pelat|prosl|ergo|meta|prin|alla|giati|pos|pote|pws)\w*/i;

export function looksLikeGreeklish(text: string): boolean {
  if (countGreekLetters(text) >= countLatinLetters(text)) return false;
  const latin = text.trim();
  if (countLatinLetters(latin) < 6) return false;
  const words = latin.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let score = 0;
  for (const word of words) {
    if (GREEKLISH_WORD.test(word)) score += 2;
    if (/^(th|ch|ps|ks)/.test(word)) score += 1;
    if (/os$|is$|as$|ou$|on$|ai$|oi$|es$|hs$/.test(word)) score += 1;
  }
  return score >= 2;
}

export function resolveTitleLanguage(
  newUpdateBody: string,
  taskDescription: string,
  previousUpdates: { title: string; body: string }[]
): { titleLanguage: TitleLanguage; isGreeklish: boolean } {
  const priorText = [
    taskDescription,
    ...previousUpdates.flatMap((u) => [u.title, u.body]),
  ]
    .filter(Boolean)
    .join(" ");

  const priorGreek = countGreekLetters(priorText);
  const priorLatin = countLatinLetters(priorText);
  const taskThreadGreek = priorGreek >= 12 && priorGreek > priorLatin;

  const newGreek = countGreekLetters(newUpdateBody);
  const newLatin = countLatinLetters(newUpdateBody);
  const greeklish = looksLikeGreeklish(newUpdateBody);

  if (newGreek > newLatin) {
    return { titleLanguage: "greek", isGreeklish: false };
  }
  if (greeklish) {
    return { titleLanguage: "greek", isGreeklish: true };
  }
  if (taskThreadGreek && newLatin > 0 && newGreek === 0) {
    return { titleLanguage: "greek", isGreeklish: false };
  }
  return { titleLanguage: "english", isGreeklish: false };
}

export function isLikelyTitleCompression(title: string, bodyPlain: string): boolean {
  const t = title.trim();
  const b = bodyPlain.trim();
  if (!t || !b) return false;
  if (t.length >= b.length * 0.9) return false;
  if (b.toLowerCase().startsWith(t.toLowerCase()) && t.length > 20) return false;
  return t.split(/\s+/).length <= MAX_TITLE_WORDS;
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

  const normalizeWords = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2);

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

export function buildTaskUpdateTitleContext(
  task: Task,
  people: Person[],
  projectName: string,
  newUpdateBodyHtml: string
): TaskUpdateTitleContext {
  const taskDescription = taskUpdatesToPlainText(taskDescriptionContent(task)).trim();
  const previousUpdates = taskUpdateEntries(task, people).map((entry) => ({
    title: entry.title?.trim() ?? "",
    body: taskUpdatesToPlainText(entry.body).trim(),
  }));
  const newUpdateBody = taskUpdatesToPlainText(newUpdateBodyHtml).trim();
  const { titleLanguage, isGreeklish } = resolveTitleLanguage(newUpdateBody, taskDescription, previousUpdates);

  return {
    taskTitle: task.title.trim(),
    projectName: projectName.trim(),
    taskDescription,
    previousUpdates,
    newUpdateBody,
    titleLanguage,
    isGreeklish,
  };
}

export function fallbackTaskUpdateTitle(bodyPlain: string): string {
  const plain = bodyPlain.replace(/\s+/g, " ").trim();
  if (!plain) return "Media update";
  const words = plain.split(/\s+/).slice(0, MAX_TITLE_WORDS);
  let title = words.join(" ");
  if (title.length > 55) {
    title = `${title.slice(0, 54).trimEnd()}…`;
  }
  return title || "Progress update";
}

export function resolveTaskUpdateTitle(bodyPlain: string, aiTitle: string | undefined): string {
  const body = bodyPlain.replace(/\s+/g, " ").trim();
  const candidate = aiTitle?.trim() ?? "";
  if (candidate && !isUnnaturalTitle(candidate, body) && isTitleGroundedInUpdate(candidate, body)) {
    return candidate;
  }
  return fallbackTaskUpdateTitle(body);
}
