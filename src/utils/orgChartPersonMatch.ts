import type { Person } from "../types";

export type OrgChartMatchContext = {
  departmentHint?: string;
  preferFounder?: boolean;
};

const TITLE_PREFIX = /^(καθ\.|καθηγ\.|prof\.|dr\.|kath\.)\s+/i;

const GR_TO_LAT: Record<string, string> = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
};

/** Strip accents and lower-case for fuzzy Greek/Latin name matching. */
export function normalizePersonToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Greek or Latin first names → shared latin key (e.g. Γιάννης and Giannis). */
export function personNameKey(value: string): string {
  const stripped = stripTitles(value);
  const first = stripped.split(/\s+/).filter(Boolean)[0] ?? stripped;
  const norm = normalizePersonToken(first);
  return norm
    .split("")
    .map((ch) => GR_TO_LAT[ch] ?? ch)
    .join("");
}

export function personFirstName(person: Person): string {
  return stripTitles(person.name).split(/\s+/).filter(Boolean)[0] ?? person.name.trim();
}

/** Org-chart label: live first name when linked to a team member, else static slot label. */
export function orgChartDisplayLabel(label: string, person?: Person): string {
  return person ? personFirstName(person) : label;
}

export function stripTitles(value: string): string {
  return value.replace(TITLE_PREFIX, "").trim();
}

function personKeys(person: Person): string[] {
  const keys = new Set<string>();
  keys.add(personNameKey(person.name));
  for (const token of normalizePersonToken(stripTitles(person.name)).split(/\s+/)) {
    if (token.length >= 3) {
      keys.add(
        token
          .split("")
          .map((ch) => GR_TO_LAT[ch] ?? ch)
          .join("")
      );
    }
  }
  const emailLocal = person.email.split("@")[0] ?? "";
  for (const part of emailLocal.split(/[._-]+/)) {
    if (part.length >= 3) keys.add(normalizePersonToken(part));
  }
  return [...keys];
}

function scorePerson(labelKey: string, person: Person, ctx: OrgChartMatchContext): number {
  let score = 0;
  if (personKeys(person).includes(labelKey)) score += 80;
  if (ctx.departmentHint && person.departments.includes(ctx.departmentHint)) score += 25;
  if (ctx.preferFounder && person.orgRole === "founder") score += 20;
  return score;
}

const NON_PERSON_KEYS = new Set(
  ["content creator", "sync team", "omada", "team"].map((s) => personNameKey(s))
);

/** Display labels that do not match directory names (e.g. company / username). */
const ORG_CHART_LABEL_KEYS: Record<string, string[]> = {};

function labelLookupKeys(label: string): string[] {
  const keys = new Set<string>();
  const labelKey = personNameKey(label);
  if (labelKey) keys.add(labelKey);
  const aliasKeys = ORG_CHART_LABEL_KEYS[normalizePersonToken(label)];
  for (const key of aliasKeys ?? []) keys.add(key);
  return [...keys];
}

/** Resolve a first-name org-chart label to a team directory person. */
export function resolveOrgChartPerson(
  label: string,
  people: Person[],
  ctx: OrgChartMatchContext = {}
): Person | undefined {
  const raw = label.trim();
  if (!raw) return undefined;

  const lookupKeys = labelLookupKeys(raw);
  const labelKey = lookupKeys[0];
  if (!labelKey || (lookupKeys.length === 1 && NON_PERSON_KEYS.has(labelKey))) return undefined;

  const candidates = people.filter((p) => lookupKeys.some((key) => personKeys(p).includes(key)));
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  return [...candidates].sort((a, b) => scorePerson(labelKey, b, ctx) - scorePerson(labelKey, a, ctx))[0];
}

/** Split founder lines and role footnotes into individual first names. */
export function splitOrgChartNameList(text: string): string[] {
  return text
    .split(/\s*[·•,]\s*|\s*&\s*|\s+και\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export const ORG_NODE_DEPARTMENT_HINT: Record<string, string> = {
  "head-ops": "Operations",
  "dept-product": "Product",
  "dept-sales": "Sales",
  "dept-marketing": "Marketing",
  "dept-pr": "Marketing",
  "dept-customer": "Operations",
  "dept-consulting": "General",
};
