import { useEffect, useMemo, useState } from "react";
import type { Appointment, AppointmentRsvpAnswer, Person, Task } from "../types";
import { ConfirmPanel } from "./TaskWorkerActions";
import { AppointmentRsvpPanel } from "./AppointmentRsvpPanel";
import { AppointmentOccurrenceContent } from "./AppointmentOccurrenceContent";
import { ImageAttachmentGallery } from "./ImageAttachmentGallery";
import { useT } from "../contexts/I18nContext";
import { formatInOrgTime } from "../utils/orgTimezone";
import {
  formatAppointmentParticipants,
  isAppointmentScheduled,
} from "../utils/appointments";
import { appointmentAttendeeIds } from "../utils/appointmentParticipants";
import { formatRecurrenceSummary } from "../utils/appointmentRecurrence";
import { isRecurringAppointment } from "../utils/appointmentDisplay";
import {
  appointmentHasMultipleSelectableOccurrences,
  occurrenceLabel,
  selectableOccurrences,
} from "../utils/appointmentRsvp";
import {
  effectiveRecurrenceCount,
  isOccurrencePast,
  type AppointmentCancelScope,
} from "../utils/appointmentOccurrence";
import type { AppointmentOccurrenceFields } from "../types";

type CancelStep = "idle" | "choose" | "confirm_instance" | "confirm_future" | "confirm_series";

export function AppointmentOccurrencePanel({
  appointment,
  people,
  currentUserId,
  occurrenceIndex,
  onOccurrenceIndexChange,
  onRsvp,
  onCancel,
  allTasks = [],
  onOpenTask,
  rsvpBusy = false,
  cancelBusy = false,
  contentBusy = false,
  showEdit,
  onEdit,
  onSaveOccurrenceContent,
}: {
  appointment: Appointment;
  people: Person[];
  currentUserId: string;
  occurrenceIndex: number;
  onOccurrenceIndexChange?: (index: number) => void;
  onRsvp: (answer: AppointmentRsvpAnswer) => void | Promise<void>;
  onCancel?: (scope: AppointmentCancelScope) => void | Promise<void>;
  allTasks?: Task[];
  onOpenTask?: (taskId: string) => void;
  rsvpBusy?: boolean;
  cancelBusy?: boolean;
  contentBusy?: boolean;
  showEdit?: boolean;
  onEdit?: () => void;
  onSaveOccurrenceContent?: (
    fields: AppointmentOccurrenceFields
  ) => void | Promise<void>;
}) {
  const t = useT();
  const [cancelStep, setCancelStep] = useState<CancelStep>("idle");

  const selectable = useMemo(() => selectableOccurrences(appointment), [appointment]);

  const occurrence = useMemo(() => {
    return selectable.find((o) => o.index === occurrenceIndex) ?? selectable[0] ?? null;
  }, [selectable, occurrenceIndex]);

  useEffect(() => {
    if (!onOccurrenceIndexChange || selectable.length === 0) return;
    if (!selectable.some((o) => o.index === occurrenceIndex)) {
      onOccurrenceIndexChange(selectable[0]!.index);
    }
  }, [selectable, occurrenceIndex, onOccurrenceIndexChange]);

  const locked = occurrence ? isOccurrencePast(occurrence) : true;
  const isCreator = appointment.createdById === currentUserId;
  const canCancel =
    Boolean(onCancel) &&
    isAppointmentScheduled(appointment) &&
    !locked &&
    isCreator &&
    Boolean(occurrence);
  const recurring = isRecurringAppointment(appointment);
  const canEditOccurrenceContent =
    Boolean(onSaveOccurrenceContent) &&
    !locked &&
    isAppointmentScheduled(appointment) &&
    appointmentAttendeeIds(appointment, people).includes(currentUserId);
  const linkedTasks = (appointment.linkedTaskIds ?? [])
    .map((id) => allTasks.find((task) => task.id === id))
    .filter((task): task is Task => Boolean(task));

  const recurrenceLabel =
    appointment.recurrenceRule &&
    formatRecurrenceSummary(
      appointment.recurrenceRule,
      appointment.recurrenceOngoing
        ? effectiveRecurrenceCount(appointment)
        : appointment.recurrenceCount,
      { ongoing: appointment.recurrenceOngoing }
    );

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900">{appointment.title}</h2>
        {occurrence && (
          <p className="mt-1 text-sm text-slate-600">
            {formatInOrgTime(occurrence.startsAt, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {occurrence.endsAt
              ? ` – ${formatInOrgTime(occurrence.endsAt, { hour: "numeric", minute: "2-digit" })}`
              : ""}
          </p>
        )}
        {recurrenceLabel && <p className="mt-1 text-xs text-indigo-700">{recurrenceLabel}</p>}
        {locked && (
          <p className="mt-2 text-xs font-medium text-slate-500">{t("appointments.occurrenceLocked")}</p>
        )}
      </div>

      {appointmentHasMultipleSelectableOccurrences(appointment) && onOccurrenceIndexChange && (
        <label className="block text-xs">
          <span className="font-medium text-slate-600">{t("appointments.rsvp.occurrence")}</span>
          <select
            value={occurrenceIndex}
            onChange={(e) => onOccurrenceIndexChange(Number(e.target.value))}
            className="input-base mt-1 w-full"
          >
            {selectable.map((occ) => (
              <option key={occ.index} value={occ.index}>
                {occurrenceLabel(occ.startsAt, occ.endsAt)}
              </option>
            ))}
          </select>
        </label>
      )}

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("appointments.participants")}
          </dt>
          <dd
            className="mt-0.5 truncate text-slate-800"
            title={formatAppointmentParticipants(appointment, people, currentUserId)}
          >
            {formatAppointmentParticipants(appointment, people, currentUserId)}
          </dd>
        </div>

        <AppointmentRsvpPanel
          appointment={appointment}
          people={people}
          occurrenceIndex={occurrenceIndex}
          currentUserId={currentUserId}
          busy={rsvpBusy}
          locked={locked}
          onRespond={onRsvp}
        />

        <AppointmentOccurrenceContent
          appointment={appointment}
          occurrenceIndex={occurrenceIndex}
          canEdit={canEditOccurrenceContent}
          busy={contentBusy}
          onSave={onSaveOccurrenceContent ?? (async () => {})}
        />

        {linkedTasks.length > 0 && onOpenTask && (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t("common.task")}</dt>
            <dd className="mt-1 space-y-1">
              {linkedTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-left text-sm font-medium text-accent hover:bg-accent/5"
                >
                  {task.title || t("common.untitledTask")}
                </button>
              ))}
            </dd>
          </div>
        )}

        {(appointment.attachments?.length ?? 0) > 0 && (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t("common.attachment")}
            </dt>
            <dd className="mt-0.5">
              <ImageAttachmentGallery
                scopeKey={`appointment-${appointment.id}`}
                attachments={appointment.attachments}
              />
            </dd>
          </div>
        )}
      </dl>

      {(canCancel || showEdit) && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {showEdit && onEdit && !locked && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("common.edit")}
            </button>
          )}

          {canCancel && cancelStep === "idle" && (
            <button
              type="button"
              disabled={cancelBusy}
              onClick={() => setCancelStep(recurring ? "choose" : "confirm_series")}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
            >
              {t("appointments.cancelAppointment")}
            </button>
          )}

          {canCancel && cancelStep === "choose" && (
            <div className="w-full space-y-2 rounded-lg border border-rose-100 bg-rose-50/50 p-3">
              <p className="text-xs font-medium text-rose-900">{t("appointments.cancelScopePrompt")}</p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={cancelBusy}
                  onClick={() => setCancelStep("confirm_instance")}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-left text-xs font-semibold text-rose-800 hover:bg-rose-50"
                >
                  {t("appointments.cancelThisInstance")}
                </button>
                <button
                  type="button"
                  disabled={cancelBusy}
                  onClick={() => setCancelStep("confirm_future")}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-left text-xs font-semibold text-rose-800 hover:bg-rose-50"
                >
                  {t("appointments.cancelThisAndFuture")}
                </button>
                <button
                  type="button"
                  disabled={cancelBusy}
                  onClick={() => setCancelStep("confirm_series")}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-left text-xs font-semibold text-rose-800 hover:bg-rose-50"
                >
                  {t("appointments.cancelEntireSeries")}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelStep("idle")}
                  className="text-xs font-medium text-slate-600 hover:underline"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          {canCancel && cancelStep === "confirm_instance" && (
            <div className="w-full">
              <ConfirmPanel
                message={t("appointments.cancelInstanceConfirm")}
                yesLabel={t("appointments.yesCancel")}
                noLabel={t("appointments.keepScheduled")}
                yesEmphasis
                onYes={() => {
                  void Promise.resolve(onCancel?.("instance")).finally(() => setCancelStep("idle"));
                }}
                onNo={() => setCancelStep("choose")}
              />
            </div>
          )}

          {canCancel && cancelStep === "confirm_future" && (
            <div className="w-full">
              <ConfirmPanel
                message={t("appointments.cancelFutureConfirm")}
                yesLabel={t("appointments.yesCancel")}
                noLabel={t("appointments.keepScheduled")}
                yesEmphasis
                onYes={() => {
                  void Promise.resolve(onCancel?.("this_and_future")).finally(() => setCancelStep("idle"));
                }}
                onNo={() => setCancelStep("choose")}
              />
            </div>
          )}

          {canCancel && cancelStep === "confirm_series" && (
            <div className="w-full">
              <ConfirmPanel
                message={t("appointments.cancelConfirm")}
                yesLabel={t("appointments.yesCancel")}
                noLabel={t("appointments.keepScheduled")}
                yesEmphasis
                onYes={() => {
                  void Promise.resolve(onCancel?.("entire_series")).finally(() => setCancelStep("idle"));
                }}
                onNo={() => setCancelStep(recurring ? "choose" : "idle")}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
