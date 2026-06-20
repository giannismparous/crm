import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import type { AppNotification, Appointment, AppointmentRsvpAnswer } from "../types";
import { notificationHeadline, notificationTaskLine } from "../utils/notificationText";
import { useT } from "../contexts/I18nContext";
import { formatInOrgTime } from "../utils/orgTimezone";
import { getOccurrenceRsvpAnswer } from "../utils/appointmentRsvp";
import { isOccurrencePast } from "../utils/appointmentOccurrence";
import { activeAppointmentOccurrences } from "../utils/appointmentDisplay";

const COLLAPSED_COUNT = 7;

function formatWhen(iso: string, t: ReturnType<typeof useT>): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return t("common.justNow");
  if (diff < 3_600_000) return t("common.minutesAgo", { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t("common.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  return formatInOrgTime(d, { month: "short", day: "numeric" });
}

function occurrenceIndexFromNotif(n: AppNotification): number | null {
  const idx = Number.parseInt(n.commentId, 10);
  return Number.isFinite(idx) ? idx : null;
}

function AppointmentRsvpNotificationRow({
  n,
  appointment,
  currentUserId,
  busy,
  onRsvp,
  onOpen,
  localAnswer,
}: {
  n: AppNotification;
  appointment: Appointment | undefined;
  currentUserId: string;
  busy: boolean;
  onRsvp: (answer: AppointmentRsvpAnswer) => void;
  onOpen: () => void;
  localAnswer?: AppointmentRsvpAnswer;
}) {
  const t = useT();
  const occurrenceIndex = occurrenceIndexFromNotif(n);
  const occurrence =
    appointment && occurrenceIndex != null
      ? activeAppointmentOccurrences(appointment).find((o) => o.index === occurrenceIndex)
      : undefined;
  const locked = occurrence ? isOccurrencePast(occurrence) : false;
  const myAnswer: AppointmentRsvpAnswer | "pending" =
    localAnswer ??
    (appointment && occurrenceIndex != null
      ? getOccurrenceRsvpAnswer(appointment, occurrenceIndex, currentUserId)
      : "pending");
  const canRespond = Boolean(appointment) && !locked && myAnswer === "pending";
  const [pendingAnswer, setPendingAnswer] = useState<AppointmentRsvpAnswer | null>(null);
  const saving = busy || pendingAnswer !== null;

  useEffect(() => {
    if (!busy) setPendingAnswer(null);
  }, [busy]);

  function handleRsvp(answer: AppointmentRsvpAnswer) {
    setPendingAnswer(answer);
    onRsvp(answer);
  }

  function rsvpLabel(answer: AppointmentRsvpAnswer, label: string) {
    if (saving && pendingAnswer === answer) {
      return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
    }
    return label;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`mx-2 my-1.5 flex w-[calc(100%-1rem)] cursor-pointer flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition hover:border-slate-300 ${
        !n.read ? "border-accent/25 bg-accent/5" : "border-slate-200 bg-white"
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold leading-snug text-slate-900">
          {n.taskTitle.trim() || t("appointments.untitled")}
        </span>
        <span className="shrink-0 text-[10px] text-slate-400">{formatWhen(n.createdAt, t)}</span>
      </span>
      {n.mentionLabel && (
        <span className="text-[11px] font-medium text-slate-600">{n.mentionLabel}</span>
      )}
      {n.bodyPreview && (
        <span className="text-[11px] leading-relaxed text-slate-500">{n.bodyPreview}</span>
      )}

      {canRespond ? (
        <div className="flex flex-wrap items-center gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleRsvp("yes")}
            className="inline-flex min-w-[3.5rem] items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
            aria-busy={saving && pendingAnswer === "yes"}
          >
            {rsvpLabel("yes", t("appointments.rsvp.yes"))}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleRsvp("no")}
            className="inline-flex min-w-[3.5rem] items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
            aria-busy={saving && pendingAnswer === "no"}
          >
            {rsvpLabel("no", t("appointments.rsvp.no"))}
          </button>
        </div>
      ) : myAnswer !== "pending" ? (
        <p className="text-[11px] font-medium text-slate-600">
          {t("appointments.rsvp.yourAnswer")}{" "}
          <span className={myAnswer === "yes" ? "text-emerald-700" : "text-rose-700"}>
            {myAnswer === "yes" ? t("appointments.rsvp.yes") : t("appointments.rsvp.no")}
          </span>
        </p>
      ) : locked ? (
        <p className="text-[11px] text-slate-500">{t("appointments.rsvp.closed")}</p>
      ) : null}
    </div>
  );
}

export function NotificationsBell({
  notifications,
  appointments = [],
  currentUserId = "",
  onSelect,
  onMarkRead,
  onMarkAllRead,
  onAppointmentRsvp,
}: {
  notifications: AppNotification[];
  appointments?: Appointment[];
  currentUserId?: string;
  onSelect: (n: AppNotification) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onAppointmentRsvp?: (n: AppNotification, answer: AppointmentRsvpAnswer) => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rsvpBusyId, setRsvpBusyId] = useState<string | null>(null);
  const [localRsvpAnswers, setLocalRsvpAnswers] = useState<Map<string, AppointmentRsvpAnswer>>(
    () => new Map()
  );
  const localRsvpAnswersRef = useRef(localRsvpAnswers);
  localRsvpAnswersRef.current = localRsvpAnswers;
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const unread = notifications.filter((n) => !n.read);

  const appointmentsById = useMemo(
    () => new Map(appointments.map((a) => [a.id, a])),
    [appointments]
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      const localAnswers = localRsvpAnswersRef.current;
      for (const n of notifications) {
        if (n.kind !== "appointment_rsvp" || n.read) continue;
        if (localAnswers.has(n.id)) {
          void onMarkRead(n.id);
          continue;
        }
        const apt = appointmentsById.get(n.taskId);
        const idx = occurrenceIndexFromNotif(n);
        if (!apt || idx == null) continue;
        if (getOccurrenceRsvpAnswer(apt, idx, currentUserId) !== "pending") {
          void onMarkRead(n.id);
        }
      }
      setLocalRsvpAnswers(new Map());
    }
    wasOpenRef.current = open;
  }, [open, notifications, appointmentsById, currentUserId, onMarkRead]);

  function pick(n: AppNotification) {
    if (n.kind !== "appointment_rsvp" && !n.read) void onMarkRead(n.id);
    onSelect(n);
    setOpen(false);
  }

  async function respondRsvp(n: AppNotification, answer: AppointmentRsvpAnswer) {
    if (!onAppointmentRsvp || rsvpBusyId) return;
    setRsvpBusyId(n.id);
    try {
      await onAppointmentRsvp(n, answer);
      setLocalRsvpAnswers((prev) => new Map(prev).set(n.id, answer));
    } finally {
      setRsvpBusyId(null);
    }
  }

  const bellNotifications = useMemo(
    () => notifications.filter((n) => n.kind !== "appointment_rsvp" || !n.read),
    [notifications]
  );

  const visible =
    expanded || bellNotifications.length <= COLLAPSED_COUNT
      ? bellNotifications
      : bellNotifications.slice(0, COLLAPSED_COUNT);
  const hiddenCount = bellNotifications.length - visible.length;

  const rsvpVisible = visible.filter((n) => n.kind === "appointment_rsvp");
  const regularVisible = visible.filter((n) => n.kind !== "appointment_rsvp");
  const showUpdatesSection = rsvpVisible.length > 0 && regularVisible.length > 0;

  function sectionHeader(label: string) {
    return (
      <li
        aria-hidden
        className="border-b border-slate-200 bg-slate-50/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
      >
        {label}
      </li>
    );
  }

  function renderNotification(n: AppNotification) {
    if (n.kind === "appointment_rsvp" && onAppointmentRsvp) {
      return (
        <AppointmentRsvpNotificationRow
          key={n.id}
          n={n}
          appointment={appointmentsById.get(n.taskId)}
          currentUserId={currentUserId}
          busy={rsvpBusyId === n.id}
          onRsvp={(answer) => void respondRsvp(n, answer)}
          onOpen={() => pick(n)}
          localAnswer={localRsvpAnswers.get(n.id)}
        />
      );
    }

    return (
      <button
        key={n.id}
        type="button"
        onClick={() => pick(n)}
        className={`flex w-full flex-col gap-1 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${
          !n.read ? "bg-accent/5" : "opacity-90"
        }`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold leading-snug text-slate-900">{notificationHeadline(n)}</span>
          <span className="shrink-0 text-[10px] text-slate-400">{formatWhen(n.createdAt, t)}</span>
        </span>
        <span className="text-[11px] font-semibold text-accent">{notificationTaskLine(n)}</span>
        {n.bodyPreview && n.kind !== "member_joined" && (
          <span className="line-clamp-2 text-[11px] leading-relaxed text-slate-600">"{n.bodyPreview}"</span>
        )}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
        aria-label={t("notifications.aria", {
          unread: unread.length ? t("notifications.unreadSuffix", { count: unread.length }) : "",
        })}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" strokeWidth={2} aria-hidden />
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 top-[calc(100%+6px)] z-50 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 transition-[max-height] duration-200 ease-out ${
            expanded ? "max-h-[min(48rem,88vh)]" : "max-h-[min(24rem,58vh)]"
          }`}
          role="dialog"
          aria-label={t("notifications.title")}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-semibold text-slate-800">{t("notifications.title")}</p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={() => void onMarkAllRead()}
                className="shrink-0 text-[10px] font-medium text-accent hover:underline"
              >
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {bellNotifications.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-500">{t("notifications.empty")}</li>
            ) : (
              <>
                {rsvpVisible.length > 0 && sectionHeader(t("notifications.appointmentRsvpAuthor"))}
                {rsvpVisible.map((n) => (
                  <li key={n.id} className="py-0.5">{renderNotification(n)}</li>
                ))}
                {showUpdatesSection && sectionHeader(t("notifications.updates"))}
                {regularVisible.map((n) => (
                  <li key={n.id}>{renderNotification(n)}</li>
                ))}
              </>
            )}
          </ul>

          {hiddenCount > 0 && (
            <div className="shrink-0 border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-accent hover:bg-accent/5"
              >
                {t("common.showMore", { count: hiddenCount })}
              </button>
            </div>
          )}
          {expanded && bellNotifications.length > COLLAPSED_COUNT && (
            <div className="shrink-0 border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("common.showLess")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
