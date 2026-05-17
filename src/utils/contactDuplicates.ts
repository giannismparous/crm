import type { SalesContact } from "../types";

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only — used to compare phone numbers loosely. */
export function normalizeContactPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

const MIN_PHONE_DIGITS = 7;

export function uniqueCompanySuggestions(contacts: SalesContact[]): string[] {
  const seen = new Map<string, string>();
  for (const c of contacts) {
    const display = c.company.trim();
    if (!display) continue;
    const key = display.toLowerCase();
    if (!seen.has(key)) seen.set(key, display);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function filterCompanySuggestions(suggestions: string[], query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return suggestions.filter((name) => name.toLowerCase().includes(q)).slice(0, limit);
}

export type ContactDuplicateMatch = {
  contact: SalesContact;
  reasons: ("email" | "phone")[];
};

export function findContactDuplicates(
  contacts: SalesContact[],
  draft: { email: string; phone: string },
  excludeContactId?: string
): ContactDuplicateMatch[] {
  const emailNorm = normalizeContactEmail(draft.email);
  const phoneNorm = normalizeContactPhone(draft.phone);
  const checkPhone = phoneNorm.length >= MIN_PHONE_DIGITS;

  if (!emailNorm && !checkPhone) return [];

  const byId = new Map<string, ContactDuplicateMatch>();

  for (const c of contacts) {
    if (excludeContactId && c.id === excludeContactId) continue;
    const reasons: ("email" | "phone")[] = [];
    if (emailNorm && normalizeContactEmail(c.email) === emailNorm) reasons.push("email");
    if (checkPhone && normalizeContactPhone(c.phone) === phoneNorm) reasons.push("phone");
    if (reasons.length === 0) continue;

    const existing = byId.get(c.id);
    if (existing) {
      for (const r of reasons) {
        if (!existing.reasons.includes(r)) existing.reasons.push(r);
      }
    } else {
      byId.set(c.id, { contact: c, reasons });
    }
  }

  return [...byId.values()].sort((a, b) =>
    contactDisplayName(a.contact).localeCompare(contactDisplayName(b.contact), undefined, {
      sensitivity: "base",
    })
  );
}

export function contactDisplayName(c: SalesContact): string {
  const name = `${c.firstName} ${c.lastName}`.trim();
  return name || "Unnamed contact";
}

function duplicateAckStorageKey(scope: string, email: string, phone: string): string {
  return `crm-dup-ack:${scope}:${normalizeContactEmail(email)}:${normalizeContactPhone(phone)}`;
}

export function readDuplicateAcknowledged(scope: string, email: string, phone: string): boolean {
  try {
    return sessionStorage.getItem(duplicateAckStorageKey(scope, email, phone)) === "1";
  } catch {
    return false;
  }
}

export function writeDuplicateAcknowledged(scope: string, email: string, phone: string): void {
  try {
    sessionStorage.setItem(duplicateAckStorageKey(scope, email, phone), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function duplicateReasonLabel(reasons: ("email" | "phone")[]): string {
  if (reasons.includes("email") && reasons.includes("phone")) return "same email and phone";
  if (reasons.includes("email")) return "same email";
  return "same phone";
}
