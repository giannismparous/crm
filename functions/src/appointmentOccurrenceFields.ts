import type { CrmAppointment } from "./crmData";
import { isRecurringCrmAppointment } from "./recurrenceRrule";

export type CrmOccurrenceFields = {
  location?: string;
  meetingLink?: string;
  description?: string;
  reviewItems?: string[];
};

function occurrenceOverride(
  apt: CrmAppointment,
  occurrenceIndex: number
): CrmOccurrenceFields | undefined {
  return apt.occurrenceFields?.[String(occurrenceIndex)];
}

function hasOverrideField(
  override: CrmOccurrenceFields | undefined,
  field: keyof CrmOccurrenceFields
): boolean {
  return Boolean(override && field in override);
}

export function getCrmOccurrenceLocation(apt: CrmAppointment, occurrenceIndex: number): string {
  const override = occurrenceOverride(apt, occurrenceIndex);
  if (hasOverrideField(override, "location")) return override!.location ?? "";
  return apt.location ?? apt.occurrenceFields?.["0"]?.location ?? "";
}

export function getCrmOccurrenceMeetingLink(apt: CrmAppointment, occurrenceIndex: number): string {
  const override = occurrenceOverride(apt, occurrenceIndex);
  if (hasOverrideField(override, "meetingLink")) return override!.meetingLink ?? "";
  return apt.meetingLink ?? apt.occurrenceFields?.["0"]?.meetingLink ?? "";
}

export function getCrmOccurrenceDescription(apt: CrmAppointment, occurrenceIndex: number): string {
  const override = occurrenceOverride(apt, occurrenceIndex);
  if (hasOverrideField(override, "description")) return override!.description ?? "";
  return apt.description ?? "";
}

export function getCrmOccurrenceReviewItems(apt: CrmAppointment, occurrenceIndex: number): string[] {
  const override = occurrenceOverride(apt, occurrenceIndex);
  if (hasOverrideField(override, "reviewItems")) return override!.reviewItems ?? [];
  if (isRecurringCrmAppointment(apt) && occurrenceIndex !== 0) return [];
  return apt.reviewItems ?? [];
}

/** Resolved fields for the series master calendar event (occurrence 0 defaults). */
export function crmAppointmentSeriesCalendarFields(apt: CrmAppointment): {
  location: string;
  meetingLink: string;
  description: string;
  reviewItems: string[];
} {
  return {
    location: getCrmOccurrenceLocation(apt, 0),
    meetingLink: getCrmOccurrenceMeetingLink(apt, 0),
    description: getCrmOccurrenceDescription(apt, 0),
    reviewItems: getCrmOccurrenceReviewItems(apt, 0),
  };
}

export function formatPerOccurrenceCalendarSection(
  apt: CrmAppointment,
  formatOccurrenceWhen: (index: number) => string
): string {
  const fields = apt.occurrenceFields;
  if (!fields || Object.keys(fields).length === 0) return "";

  const series = crmAppointmentSeriesCalendarFields(apt);
  const lines: string[] = [];

  for (const key of Object.keys(fields).sort((a, b) => Number(a) - Number(b))) {
    const index = Number(key);
    if (!Number.isFinite(index) || index < 0) continue;
    const override = fields[key];
    if (!override) continue;

    const loc = hasOverrideField(override, "location")
      ? override.location ?? ""
      : series.location;
    const link = hasOverrideField(override, "meetingLink")
      ? override.meetingLink ?? ""
      : series.meetingLink;
    const desc = hasOverrideField(override, "description")
      ? override.description ?? ""
      : series.description;
    const review = hasOverrideField(override, "reviewItems")
      ? override.reviewItems ?? []
      : index === 0
        ? series.reviewItems
        : [];

    const differs =
      (hasOverrideField(override, "location") && loc !== series.location) ||
      (hasOverrideField(override, "meetingLink") && link !== series.meetingLink) ||
      (hasOverrideField(override, "description") && desc !== series.description) ||
      (hasOverrideField(override, "reviewItems") &&
        JSON.stringify(review) !== JSON.stringify(index === 0 ? series.reviewItems : []));

    if (!differs && index !== 0) continue;

    const parts: string[] = [];
    if (loc.trim()) parts.push(`Location: ${loc.trim()}`);
    if (link.trim()) parts.push(`Link: ${link.trim()}`);
    if (review.length > 0) parts.push(`Review: ${review.join("; ")}`);
    if (desc.trim()) parts.push(`Notes: ${desc.trim()}`);
    if (parts.length === 0) continue;

    lines.push(`${formatOccurrenceWhen(index)}\n${parts.join("\n")}`);
  }

  return lines.join("\n\n");
}
