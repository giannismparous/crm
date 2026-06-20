import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "../contexts/I18nContext";
import type { Appointment, AppointmentRsvpAnswer, Person } from "../types";
import { personDisplayName } from "../utils/appointments";
import { appointmentAttendeeIds } from "../utils/appointmentParticipants";
import {
  formatRsvpAnswerLabel,
  getOccurrenceRsvpAnswer,
  sortedAppointmentAttendees,
} from "../utils/appointmentRsvp";

function statusChipClass(status: AppointmentRsvpAnswer | "pending") {
  if (status === "yes") return "bg-emerald-100 text-emerald-800";
  if (status === "no") return "bg-rose-100 text-rose-800";
  return "bg-slate-200 text-slate-700";
}

function RsvpSpinner({ compact = false }: { compact?: boolean }) {
  return (
    <Loader2
      className={`animate-spin ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`}
      aria-hidden
    />
  );
}

export function AppointmentRsvpPanel({
  appointment,
  people,
  occurrenceIndex,
  currentUserId,
  busy = false,
  locked = false,
  onRespond,
}: {
  appointment: Appointment;
  people: Person[];
  occurrenceIndex: number;
  currentUserId: string;
  busy?: boolean;
  locked?: boolean;
  onRespond: (answer: AppointmentRsvpAnswer) => void | Promise<void>;
}) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<AppointmentRsvpAnswer | null>(null);
  const attendees = sortedAppointmentAttendees(appointment, people);

  const labels = {
    yes: t("appointments.rsvp.yes"),
    no: t("appointments.rsvp.no"),
    pending: t("appointments.rsvp.pending"),
  };

  const canRespond =
    !locked &&
    appointment.status === "scheduled" &&
    appointmentAttendeeIds(appointment, people).includes(currentUserId);
  const myAnswer = getOccurrenceRsvpAnswer(appointment, occurrenceIndex, currentUserId);
  const hasAnswer = myAnswer === "yes" || myAnswer === "no";
  const saving = busy || pendingAnswer !== null;

  useEffect(() => {
    if (!busy) setPendingAnswer(null);
  }, [busy]);

  useEffect(() => {
    if (!saving) setRevealed(false);
  }, [saving, myAnswer]);

  if (attendees.length === 0) return null;

  function handleRespond(answer: AppointmentRsvpAnswer) {
    setPendingAnswer(answer);
    setRevealed(true);
    void Promise.resolve(onRespond(answer)).catch(() => setPendingAnswer(null));
  }

  function isActiveAnswer(answer: AppointmentRsvpAnswer) {
    if (saving && pendingAnswer) return pendingAnswer === answer;
    return myAnswer === answer;
  }

  const motionClass = saving ? "" : "transition-opacity duration-200 ease-out";

  const yesClass = (active: boolean, compact = false) =>
    `inline-flex items-center justify-center gap-1 rounded-lg font-semibold disabled:opacity-50 ${
      saving ? "" : "transition"
    } ${
      compact ? "min-w-[2.25rem] px-2 py-0.5 text-[10px]" : "min-w-[3.5rem] px-3 py-1.5 text-xs"
    } ${
      active
        ? "bg-emerald-600 text-white"
        : "border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
    }`;

  const noClass = (active: boolean, compact = false) =>
    `inline-flex items-center justify-center gap-1 rounded-lg font-semibold disabled:opacity-50 ${
      saving ? "" : "transition"
    } ${
      compact ? "min-w-[2.25rem] px-2 py-0.5 text-[10px]" : "min-w-[3.5rem] px-3 py-1.5 text-xs"
    } ${
      active
        ? "bg-rose-600 text-white"
        : "border border-rose-200 bg-white text-rose-800 hover:bg-rose-50"
    }`;

  function buttonLabel(answer: AppointmentRsvpAnswer, label: string, compact = false) {
    if (saving && pendingAnswer === answer) {
      return <RsvpSpinner compact={compact} />;
    }
    return label;
  }

  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {t("appointments.rsvp.title")}
      </dt>
      <dd className="mt-1.5 space-y-2">
        <ul className="space-y-1.5">
          {attendees.map((person) => {
            const status = getOccurrenceRsvpAnswer(appointment, occurrenceIndex, person.id);
            const isMe = person.id === currentUserId;
            const inlineChange = isMe && canRespond && hasAnswer;

            return (
              <li
                key={person.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5"
              >
                <span
                  className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800"
                  title={`${personDisplayName(person)}${isMe ? ` ${t("common.you")}` : ""}`}
                >
                  {personDisplayName(person)}
                  {isMe ? ` ${t("common.you")}` : ""}
                </span>

                {inlineChange ? (
                  <div
                    className="relative shrink-0"
                    title={saving ? undefined : t("appointments.rsvp.changeAnswer")}
                    onMouseEnter={() => !saving && setRevealed(true)}
                    onMouseLeave={() => !saving && setRevealed(false)}
                    onFocus={() => !saving && setRevealed(true)}
                    onBlur={(e) => {
                      if (saving) return;
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setRevealed(false);
                      }
                    }}
                  >
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusChipClass(
                        status
                      )} ${motionClass} ${revealed || saving ? "invisible" : ""}`}
                      aria-hidden={revealed || saving}
                    >
                      {formatRsvpAnswerLabel(status, labels)}
                    </span>

                    <div
                      className={`absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-lg bg-slate-50/95 px-0.5 shadow-sm ${motionClass} ${
                        revealed || saving ? "opacity-100" : "pointer-events-none opacity-0"
                      }`}
                      aria-hidden={!revealed && !saving}
                    >
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleRespond("yes")}
                        className={yesClass(isActiveAnswer("yes"), true)}
                        aria-busy={saving && pendingAnswer === "yes"}
                      >
                        {buttonLabel("yes", t("appointments.rsvp.yes"), true)}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleRespond("no")}
                        className={noClass(isActiveAnswer("no"), true)}
                        aria-busy={saving && pendingAnswer === "no"}
                      >
                        {buttonLabel("no", t("appointments.rsvp.no"), true)}
                      </button>
                    </div>
                  </div>
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusChipClass(
                      status
                    )}`}
                  >
                    {formatRsvpAnswerLabel(status, labels)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {canRespond && !hasAnswer && (
          <div className="border-t border-slate-100 pt-2">
            <span className="text-xs font-medium text-slate-600">{t("appointments.rsvp.yourAnswer")}</span>
            <div className="mt-1.5 flex flex-nowrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleRespond("yes")}
                className={yesClass(isActiveAnswer("yes"))}
                aria-busy={saving && pendingAnswer === "yes"}
              >
                {buttonLabel("yes", t("appointments.rsvp.yes"))}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleRespond("no")}
                className={noClass(isActiveAnswer("no"))}
                aria-busy={saving && pendingAnswer === "no"}
              >
                {buttonLabel("no", t("appointments.rsvp.no"))}
              </button>
            </div>
          </div>
        )}

        {locked && myAnswer === "pending" && (
          <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">
            {t("appointments.rsvp.closed")}
          </p>
        )}
      </dd>
    </div>
  );
}
