import type { Appointment, AppointmentOccurrenceFields } from "../types";
import { isRecurringAppointment } from "./appointmentDisplay";

export function normalizeOccurrenceFieldsEntry(
  raw: unknown
): AppointmentOccurrenceFields | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const entry: AppointmentOccurrenceFields = {};
  if ("location" in data) entry.location = String(data.location ?? "");
  if ("meetingLink" in data) entry.meetingLink = String(data.meetingLink ?? "").trim();
  if ("description" in data) entry.description = String(data.description ?? "");
  if (Array.isArray(data.reviewItems)) {
    const items = [
      ...new Set(data.reviewItems.map((x) => String(x).trim()).filter(Boolean)),
    ];
    if (items.length > 0) entry.reviewItems = items;
  }
  return Object.keys(entry).length > 0 ? entry : null;
}

export function normalizeOccurrenceFieldsMap(
  raw: unknown
): Record<string, AppointmentOccurrenceFields> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, AppointmentOccurrenceFields> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Math.floor(Number(key));
    if (!Number.isFinite(index) || index < 0) continue;
    const entry = normalizeOccurrenceFieldsEntry(value);
    if (entry) out[String(index)] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function occurrenceOverride(
  apt: Appointment,
  occurrenceIndex: number
): AppointmentOccurrenceFields | undefined {
  return apt.occurrenceFields?.[String(occurrenceIndex)];
}

function hasOverrideField(
  override: AppointmentOccurrenceFields | undefined,
  field: keyof AppointmentOccurrenceFields
): boolean {
  return Boolean(override && field in override);
}

function seriesReviewItemsDefault(apt: Appointment, occurrenceIndex: number): string[] {
  if (isRecurringAppointment(apt) && occurrenceIndex !== 0) return [];
  return apt.reviewItems ?? [];
}

export function getOccurrenceLocation(apt: Appointment, occurrenceIndex: number): string {
  const override = occurrenceOverride(apt, occurrenceIndex);
  if (hasOverrideField(override, "location")) return override!.location ?? "";
  return apt.location ?? apt.occurrenceFields?.["0"]?.location ?? "";
}

export function getOccurrenceMeetingLink(apt: Appointment, occurrenceIndex: number): string {
  const override = occurrenceOverride(apt, occurrenceIndex);
  if (hasOverrideField(override, "meetingLink")) return override!.meetingLink ?? "";
  return apt.meetingLink ?? apt.occurrenceFields?.["0"]?.meetingLink ?? "";
}

export function getOccurrenceDescription(apt: Appointment, occurrenceIndex: number): string {
  const override = occurrenceOverride(apt, occurrenceIndex);
  if (hasOverrideField(override, "description")) return override!.description ?? "";
  return apt.description ?? "";
}

export function getOccurrenceReviewItems(apt: Appointment, occurrenceIndex: number): string[] {
  const override = occurrenceOverride(apt, occurrenceIndex);
  if (hasOverrideField(override, "reviewItems")) return override!.reviewItems ?? [];
  return seriesReviewItemsDefault(apt, occurrenceIndex);
}

export function occurrenceFieldsForCreate(
  recurring: boolean,
  occurrenceIndex: number,
  draft: {
    reviewItems: string[];
  }
): AppointmentOccurrenceFields | undefined {
  if (!recurring || occurrenceIndex !== 0) return undefined;
  const reviewItems = [
    ...new Set(draft.reviewItems.map((x) => x.trim()).filter(Boolean)),
  ];
  if (reviewItems.length === 0) return undefined;
  return { reviewItems };
}

function reviewListsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function occurrenceOverridePatch(
  apt: Appointment,
  occurrenceIndex: number,
  fields: AppointmentOccurrenceFields
): Pick<Appointment, "occurrenceFields"> {
  const key = String(occurrenceIndex);
  const existing = apt.occurrenceFields?.[key] ?? {};
  const next: AppointmentOccurrenceFields = { ...existing };

  if ("location" in fields) {
    const value = fields.location ?? "";
    const seriesDefault = apt.location ?? apt.occurrenceFields?.["0"]?.location ?? "";
    if (value === seriesDefault) delete next.location;
    else next.location = value;
  }
  if ("meetingLink" in fields) {
    const value = String(fields.meetingLink ?? "").trim();
    const seriesDefault = (apt.meetingLink ?? apt.occurrenceFields?.["0"]?.meetingLink ?? "").trim();
    if (value === seriesDefault) delete next.meetingLink;
    else if (value) next.meetingLink = value;
    else next.meetingLink = "";
  }
  if ("description" in fields) {
    const value = String(fields.description ?? "").trim();
    const seriesDefault = (apt.description ?? "").trim();
    if (value === seriesDefault) delete next.description;
    else if (value) next.description = value;
    else next.description = "";
  }
  if ("reviewItems" in fields) {
    const items = [
      ...new Set((fields.reviewItems ?? []).map((x) => x.trim()).filter(Boolean)),
    ];
    const seriesDefault = seriesReviewItemsDefault(apt, occurrenceIndex);
    if (reviewListsEqual(items, seriesDefault)) delete next.reviewItems;
    else if (items.length > 0) next.reviewItems = items;
    else next.reviewItems = [];
  }

  const all = { ...(apt.occurrenceFields ?? {}) };
  if (Object.keys(next).length === 0) delete all[key];
  else all[key] = next;
  return { occurrenceFields: Object.keys(all).length > 0 ? all : {} };
}

export function mergeOccurrenceFieldsPatch(
  apt: Appointment,
  occurrenceIndex: number,
  partial: AppointmentOccurrenceFields
): Pick<Appointment, "occurrenceFields"> {
  const key = String(occurrenceIndex);
  const existing = apt.occurrenceFields?.[key] ?? {};
  const next: AppointmentOccurrenceFields = { ...existing, ...partial };
  if ("location" in partial) next.location = partial.location ?? "";
  if ("meetingLink" in partial) {
    const link = String(partial.meetingLink ?? "").trim();
    if (link) next.meetingLink = link;
    else delete next.meetingLink;
  }
  if ("description" in partial) {
    const desc = String(partial.description ?? "").trim();
    if (desc) next.description = desc;
    else delete next.description;
  }
  if ("reviewItems" in partial) {
    const items = [
      ...new Set((partial.reviewItems ?? []).map((x) => x.trim()).filter(Boolean)),
    ];
    if (items.length > 0) next.reviewItems = items;
    else delete next.reviewItems;
  }
  const all = { ...(apt.occurrenceFields ?? {}) };
  if (Object.keys(next).length === 0) delete all[key];
  else all[key] = next;
  return { occurrenceFields: Object.keys(all).length > 0 ? all : {} };
}

export function buildOccurrenceContentPatch(
  apt: Appointment,
  occurrenceIndex: number,
  fields: AppointmentOccurrenceFields
): Partial<Appointment> {
  if (isRecurringAppointment(apt)) {
    return occurrenceOverridePatch(apt, occurrenceIndex, fields);
  }
  const patch: Partial<Appointment> = {};
  if ("location" in fields) patch.location = fields.location ?? "";
  if ("meetingLink" in fields) {
    const link = String(fields.meetingLink ?? "").trim();
    patch.meetingLink = link || undefined;
  }
  if ("description" in fields) patch.description = fields.description ?? "";
  if ("reviewItems" in fields) {
    patch.reviewItems = [
      ...new Set((fields.reviewItems ?? []).map((x) => x.trim()).filter(Boolean)),
    ];
  }
  return patch;
}
