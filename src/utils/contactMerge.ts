import type { ContactReminder, ContactStage, SalesContact } from "../types";
import { normalizeContactEmail, normalizeContactPhone } from "./contactDuplicates";

export type MergeFieldKey =
  | "firstName"
  | "lastName"
  | "company"
  | "jobTitle"
  | "email"
  | "phone"
  | "website"
  | "stage"
  | "estimatedValue"
  | "currency"
  | "lastContactedAt"
  | "generalNotes";

export const MERGE_FIELD_KEYS: MergeFieldKey[] = [
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "email",
  "phone",
  "website",
  "stage",
  "estimatedValue",
  "currency",
  "lastContactedAt",
  "generalNotes",
];

export const MERGE_FIELD_LABEL: Record<MergeFieldKey, string> = {
  firstName: "First name",
  lastName: "Last name",
  company: "Company",
  jobTitle: "Job title",
  email: "Email",
  phone: "Phone",
  website: "Website",
  stage: "Stage",
  estimatedValue: "Est. deal value",
  currency: "Currency",
  lastContactedAt: "Last contacted",
  generalNotes: "General notes",
};

export type MergeSourceId = "draft" | string;

export type MergeSourceSnapshot = {
  id: MergeSourceId;
  label: string;
  values: Record<MergeFieldKey, string>;
  reminders: ContactReminder[];
};

export type MergeFieldOption = {
  sourceId: MergeSourceId;
  sourceLabel: string;
  value: string;
  display: string;
};

export type MergeFormValues = Record<MergeFieldKey, string>;

export function salesContactToMergeSnapshot(
  contact: SalesContact,
  label: string
): MergeSourceSnapshot {
  return {
    id: contact.id,
    label,
    values: contactToMergeValues(contact),
    reminders: contact.reminders,
  };
}

export function contactToMergeValues(contact: SalesContact): Record<MergeFieldKey, string> {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    jobTitle: contact.jobTitle,
    email: contact.email,
    phone: contact.phone,
    website: contact.website,
    stage: contact.stage,
    estimatedValue: String(contact.estimatedValue),
    currency: contact.currency,
    lastContactedAt: toDatetimeLocalValue(contact.lastContactedAt),
    generalNotes: contact.generalNotes,
  };
}

export function draftToMergeSnapshot(
  draft: {
    firstName: string;
    lastName: string;
    company: string;
    jobTitle: string;
    email: string;
    phone: string;
    website: string;
    stage: ContactStage;
    estimatedValue: string;
    currency: string;
    lastContactedAt: string;
    generalNotes: string;
  },
  label = "This entry"
): MergeSourceSnapshot {
  return {
    id: "draft",
    label,
    values: {
      firstName: draft.firstName,
      lastName: draft.lastName,
      company: draft.company,
      jobTitle: draft.jobTitle,
      email: draft.email,
      phone: draft.phone,
      website: draft.website,
      stage: draft.stage,
      estimatedValue: draft.estimatedValue,
      currency: draft.currency,
      lastContactedAt: draft.lastContactedAt,
      generalNotes: draft.generalNotes,
    },
    reminders: [],
  };
}

function toDatetimeLocalValue(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export function mergeValuesEqual(field: MergeFieldKey, a: string, b: string): boolean {
  if (field === "email") {
    return normalizeContactEmail(a) === normalizeContactEmail(b);
  }
  if (field === "phone") {
    const pa = normalizeContactPhone(a);
    const pb = normalizeContactPhone(b);
    if (!pa && !pb) return true;
    if (!pa || !pb) return false;
    return pa === pb;
  }
  if (field === "estimatedValue") {
    return (Number(a) || 0) === (Number(b) || 0);
  }
  if (field === "lastContactedAt") {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function getMergeFieldOptions(
  field: MergeFieldKey,
  sources: MergeSourceSnapshot[]
): MergeFieldOption[] {
  const options: MergeFieldOption[] = [];
  for (const source of sources) {
    const value = source.values[field];
    if (options.some((o) => mergeValuesEqual(field, o.value, value))) continue;
    options.push({
      sourceId: source.id,
      sourceLabel: source.label,
      value,
      display: formatMergeFieldDisplay(field, value),
    });
  }
  return options;
}

export function fieldHasConflict(field: MergeFieldKey, sources: MergeSourceSnapshot[]): boolean {
  return getMergeFieldOptions(field, sources).length > 1;
}

export function buildInitialMergeFormValues(sources: MergeSourceSnapshot[]): MergeFormValues {
  const values = {} as MergeFormValues;
  for (const field of MERGE_FIELD_KEYS) {
    const options = getMergeFieldOptions(field, sources);
    const preferred =
      options.find((o) => o.sourceId === "draft") ??
      options.find((o) => o.value.trim() !== "") ??
      options[0];
    values[field] = preferred?.value ?? "";
  }
  return values;
}

export function formatMergeFieldDisplay(field: MergeFieldKey, value: string): string {
  if (field === "lastContactedAt" && value) {
    try {
      return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return value;
    }
  }
  if (field === "stage") {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  if (field === "estimatedValue") {
    return String(Number(value) || 0);
  }
  const trimmed = value.trim();
  return trimmed || "—";
}

export function mergeFormToContactPayload(values: MergeFormValues): Omit<SalesContact, "id" | "reminders"> {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    company: values.company.trim(),
    jobTitle: values.jobTitle.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    website: values.website.trim(),
    stage: values.stage as ContactStage,
    estimatedValue: Number(values.estimatedValue) || 0,
    currency: values.currency,
    lastContactedAt: new Date(values.lastContactedAt).toISOString(),
    generalNotes: values.generalNotes.trim(),
  };
}

export function collectMergeReminders(sources: MergeSourceSnapshot[]): Omit<ContactReminder, "id" | "done">[] {
  const seen = new Set<string>();
  const out: Omit<ContactReminder, "id" | "done">[] = [];
  for (const source of sources) {
    for (const r of source.reminders) {
      const key = `${r.title.trim().toLowerCase()}|${r.dueAt}|${r.notes.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title: r.title, dueAt: r.dueAt, notes: r.notes });
    }
  }
  return out;
}
