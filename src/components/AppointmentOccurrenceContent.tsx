import { useMemo, type ReactNode } from "react";
import type { Appointment } from "../types";
import { SimpleRichTextView } from "./SimpleRichText";
import { useT } from "../contexts/I18nContext";
import {
  getOccurrenceDescription,
  getOccurrenceLocation,
  getOccurrenceMeetingLink,
  getOccurrenceReviewItems,
} from "../utils/appointmentOccurrenceFields";
import { isStoredRichTextBody, richTextHasContent } from "../utils/richTextImages";

function ReadOnlyField({
  label,
  children,
  empty = false,
}: {
  label: string;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-sm ${empty ? "text-slate-400 italic" : "text-slate-800"}`}>{children}</dd>
    </div>
  );
}

export function AppointmentOccurrenceContent({
  appointment,
  occurrenceIndex,
  canEdit,
  onEdit,
}: {
  appointment: Appointment;
  occurrenceIndex: number;
  canEdit: boolean;
  onEdit?: () => void;
}) {
  const t = useT();
  const location = useMemo(
    () => getOccurrenceLocation(appointment, occurrenceIndex),
    [appointment, occurrenceIndex]
  );
  const meetingLink = useMemo(
    () => getOccurrenceMeetingLink(appointment, occurrenceIndex),
    [appointment, occurrenceIndex]
  );
  const description = useMemo(
    () => getOccurrenceDescription(appointment, occurrenceIndex),
    [appointment, occurrenceIndex]
  );
  const reviewItems = useMemo(
    () => getOccurrenceReviewItems(appointment, occurrenceIndex),
    [appointment, occurrenceIndex]
  );

  return (
    <div className="space-y-2.5 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {t("appointments.occurrenceDetails")}
        </h3>
        {canEdit && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("common.edit")}
          </button>
        )}
      </div>

      <dl className="space-y-2.5">
        <ReadOnlyField label={t("appointments.whatToReview")} empty={reviewItems.length === 0}>
          {reviewItems.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {reviewItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            t("appointments.fieldNotSet")
          )}
        </ReadOnlyField>

        <ReadOnlyField label={t("appointments.location")} empty={!location.trim()}>
          {location.trim() || t("appointments.fieldNotSet")}
        </ReadOnlyField>

        <ReadOnlyField label={t("appointments.meetingLink")} empty={!meetingLink.trim()}>
          {meetingLink.trim() ? (
            <a
              href={meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-medium text-accent hover:underline not-italic"
            >
              {meetingLink}
            </a>
          ) : (
            t("appointments.fieldNotSet")
          )}
        </ReadOnlyField>

        <ReadOnlyField label={t("common.description")} empty={!richTextHasContent(description)}>
          {richTextHasContent(description) ? (
            isStoredRichTextBody(description) ? (
              <SimpleRichTextView
                html={description}
                collapseKey={`appointment-desc-view-${appointment.id}-${occurrenceIndex}`}
              />
            ) : (
              <p className="whitespace-pre-wrap not-italic">{description}</p>
            )
          ) : (
            t("appointments.fieldNotSet")
          )}
        </ReadOnlyField>
      </dl>
    </div>
  );
}
