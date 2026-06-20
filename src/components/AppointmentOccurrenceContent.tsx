import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { Appointment, AppointmentOccurrenceFields } from "../types";
import { ReviewItemsEditor } from "./ReviewItemsEditor";
import { SimpleRichText, SimpleRichTextView } from "./SimpleRichText";
import { useT } from "../contexts/I18nContext";
import {
  getOccurrenceDescription,
  getOccurrenceLocation,
  getOccurrenceMeetingLink,
  getOccurrenceReviewItems,
} from "../utils/appointmentOccurrenceFields";
import { isStoredRichTextBody, richTextHasContent } from "../utils/richTextImages";
import { sanitizeTaskUpdates } from "../utils/sanitizeRichText";

type ContentDraft = {
  location: string;
  meetingLink: string;
  description: string;
  reviewItems: string[];
};

function draftFromAppointment(appointment: Appointment, occurrenceIndex: number): ContentDraft {
  return {
    location: getOccurrenceLocation(appointment, occurrenceIndex),
    meetingLink: getOccurrenceMeetingLink(appointment, occurrenceIndex),
    description: getOccurrenceDescription(appointment, occurrenceIndex),
    reviewItems: [...getOccurrenceReviewItems(appointment, occurrenceIndex)],
  };
}

function draftsEqual(a: ContentDraft, b: ContentDraft): boolean {
  return (
    a.location === b.location &&
    a.meetingLink === b.meetingLink &&
    a.description === b.description &&
    a.reviewItems.length === b.reviewItems.length &&
    a.reviewItems.every((item, i) => item === b.reviewItems[i])
  );
}

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
  busy = false,
  onSave,
}: {
  appointment: Appointment;
  occurrenceIndex: number;
  canEdit: boolean;
  busy?: boolean;
  onSave: (fields: AppointmentOccurrenceFields) => void | Promise<void>;
}) {
  const t = useT();
  const baseline = useMemo(
    () => draftFromAppointment(appointment, occurrenceIndex),
    [appointment, occurrenceIndex]
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(baseline);
  const dirty = editing && !draftsEqual(draft, baseline);

  useEffect(() => {
    setDraft(baseline);
    setEditing(false);
  }, [baseline]);

  const location = getOccurrenceLocation(appointment, occurrenceIndex);
  const meetingLink = getOccurrenceMeetingLink(appointment, occurrenceIndex);
  const description = getOccurrenceDescription(appointment, occurrenceIndex);
  const reviewItems = getOccurrenceReviewItems(appointment, occurrenceIndex);

  function startEditing() {
    setDraft(baseline);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(baseline);
    setEditing(false);
  }

  async function handleSave() {
    const fields: AppointmentOccurrenceFields = {
      location: draft.location.trim(),
      meetingLink: draft.meetingLink.trim(),
      description: sanitizeTaskUpdates(draft.description.trim()),
      reviewItems: [...new Set(draft.reviewItems.map((x) => x.trim()).filter(Boolean))],
    };
    await onSave(fields);
    setEditing(false);
  }

  if (canEdit && editing) {
    return (
      <div className="space-y-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("appointments.occurrenceDetails")}
          </h3>
          <span className="text-[10px] font-medium text-accent">{t("appointments.editingDetails")}</span>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("appointments.whatToReview")}
          </label>
          <div className="mt-1">
            <ReviewItemsEditor
              compact
              items={draft.reviewItems}
              onChange={(reviewItems) => setDraft((prev) => ({ ...prev, reviewItems }))}
            />
          </div>
        </div>

        <label className="block text-xs">
          <span className="font-medium text-slate-600">{t("appointments.location")}</span>
          <input
            value={draft.location}
            onChange={(e) => setDraft((prev) => ({ ...prev, location: e.target.value }))}
            className="input-base mt-1 w-full"
            placeholder={t("appointments.locationPlaceholder")}
          />
        </label>

        <label className="block text-xs">
          <span className="font-medium text-slate-600">{t("appointments.meetingLink")}</span>
          <input
            value={draft.meetingLink}
            onChange={(e) => setDraft((prev) => ({ ...prev, meetingLink: e.target.value }))}
            className="input-base mt-1 w-full"
            placeholder={t("appointments.meetingLinkPlaceholder")}
          />
        </label>

        <div>
          <span className="text-xs font-medium text-slate-600">{t("common.description")}</span>
          <div className="mt-1">
            <SimpleRichText
              value={draft.description}
              onChange={(description) => setDraft((prev) => ({ ...prev, description }))}
              placeholder={t("appointments.descriptionPlaceholder")}
              collapseKey={`appointment-occ-desc-${appointment.id}-${occurrenceIndex}`}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {t("common.save")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={cancelEditing}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {t("appointments.occurrenceDetails")}
        </h3>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEditing}
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
