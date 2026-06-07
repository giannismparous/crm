import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Appointment, Person, Task, TaskListScope } from "../types";
import { isTaskOpen } from "../utils/personTaskStats";
import { newAppointmentDocId } from "../firebase/firestoreIds";
import { deleteImagesFromStorage } from "../utils/imageAttachments";
import { isStoredRichTextBody, richTextHasContent, storagePathsInUpdatesHtml } from "../utils/richTextImages";
import { sanitizeTaskUpdates, taskUpdatesToPlainText } from "../utils/sanitizeRichText";
import { ImageAttachmentGallery } from "./ImageAttachmentGallery";
import { SimpleRichText, SimpleRichTextView } from "./SimpleRichText";
import {
  appointmentStartsAtMs,
  formatAppointmentParticipants,
  formatAppointmentTimeRange,
  isAppointmentRelevantToPerson,
  isAppointmentScheduled,
} from "../utils/appointments";
import { ParticipantMultiSelect } from "./ParticipantMultiSelect";
import {
  datetimeLocalToIso,
  defaultOrgDatetimeLocal,
  formatInOrgTime,
  orgDateKey,
  orgTodayDateKey,
  toDatetimeLocalValue,
} from "../utils/orgTimezone";

type AppointmentListTab = "upcoming" | "past" | "canceled";

type AppointmentDraft = {
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
  location: string;
  meetingLink: string;
  participantIds: string[];
  participantDepartmentIds: string[];
  taskId: string;
};

function emptyDraft(currentUserId: string): AppointmentDraft {
  return {
    title: "",
    startsAt: defaultStartsAt(),
    endsAt: "",
    description: "",
    location: "",
    meetingLink: "",
    participantIds: currentUserId ? [currentUserId] : [],
    participantDepartmentIds: [],
    taskId: "",
  };
}

function defaultStartsAt(): string {
  return defaultOrgDatetimeLocal(1);
}

export function AppointmentsTab({
  appointments,
  tasks,
  people,
  currentUserId,
  seesAllOrgData = true,
  onCreateAppointment,
  onUpdateAppointment,
  onCancelAppointment,
  focusAppointmentId,
  onFocusAppointmentHandled,
}: {
  appointments: Appointment[];
  tasks: Task[];
  people: Person[];
  currentUserId: string;
  seesAllOrgData?: boolean;
  onCreateAppointment: (
    payload: Omit<Appointment, "id" | "createdAt" | "status">,
    appointmentId?: string
  ) => Promise<string>;
  onUpdateAppointment: (id: string, patch: Partial<Appointment>) => Promise<void>;
  onCancelAppointment: (id: string) => Promise<void>;
  focusAppointmentId?: string | null;
  onFocusAppointmentHandled?: () => void;
}) {
  const [scope, setScope] = useState<TaskListScope>("my");
  const [listTab, setListTab] = useState<AppointmentListTab>("upcoming");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(currentUserId));
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionImagesUploading, setDescriptionImagesUploading] = useState(false);
  const [newAppointmentDraftId, setNewAppointmentDraftId] = useState(newAppointmentDocId);
  const descriptionAtEditStartRef = useRef("");
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const nowMs = Date.now();
  const openTasks = useMemo(() => tasks.filter((t) => isTaskOpen(t)), [tasks]);

  const scoped = useMemo(() => {
    const base =
      scope === "my" && currentUserId && seesAllOrgData
        ? appointments.filter((a) => isAppointmentRelevantToPerson(a, currentUserId, people))
        : appointments;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => {
      const blob =
        `${a.title} ${taskUpdatesToPlainText(sanitizeTaskUpdates(a.description ?? ""))} ${a.location} ${a.meetingLink}`.toLowerCase();
      return blob.includes(q);
    });
  }, [appointments, scope, seesAllOrgData, currentUserId, people, query]);

  const filtered = useMemo(() => {
    return scoped.filter((a) => {
      if (listTab === "canceled") return a.status === "canceled";
      if (a.status === "canceled") return false;
      const ms = appointmentStartsAtMs(a);
      if (listTab === "upcoming") return ms >= nowMs - 60 * 60 * 1000;
      return ms < nowMs - 60 * 60 * 1000;
    });
  }, [scoped, listTab, nowMs]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const ta = appointmentStartsAtMs(a);
      const tb = appointmentStartsAtMs(b);
      return listTab === "past" || listTab === "canceled" ? tb - ta : ta - tb;
    });
    return list;
  }, [filtered, listTab]);

  const selected = useMemo(
    () => (selectedId ? appointments.find((a) => a.id === selectedId) : undefined),
    [appointments, selectedId]
  );

  useEffect(() => {
    if (!selectedId) return;
    if (!sorted.some((a) => a.id === selectedId)) setSelectedId("");
  }, [sorted, selectedId]);

  useEffect(() => {
    if (!focusAppointmentId) return;
    const apt = appointments.find((a) => a.id === focusAppointmentId);
    if (!apt) return;
    setShowForm(false);
    setEditing(false);
    if (apt.status === "canceled") setListTab("canceled");
    else if (appointmentStartsAtMs(apt) < nowMs - 60 * 60 * 1000) setListTab("past");
    else setListTab("upcoming");
    setSelectedId(focusAppointmentId);
    const t = window.setTimeout(() => {
      cardRefs.current[focusAppointmentId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      onFocusAppointmentHandled?.();
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusAppointmentId, appointments, nowMs, onFocusAppointmentHandled]);

  function discardDraftDescriptionOrphans() {
    const keep = new Set(storagePathsInUpdatesHtml(descriptionAtEditStartRef.current));
    const orphans = storagePathsInUpdatesHtml(draft.description).filter((p) => !keep.has(p));
    if (orphans.length > 0) void deleteImagesFromStorage(orphans);
    setDescriptionImagesUploading(false);
    descriptionAtEditStartRef.current = "";
  }

  function openCreate() {
    setDraft(emptyDraft(currentUserId));
    setNewAppointmentDraftId(newAppointmentDocId());
    descriptionAtEditStartRef.current = "";
    setDescriptionImagesUploading(false);
    setShowForm(true);
    setEditing(false);
    setSelectedId("");
    setError(null);
  }

  function openEdit(apt: Appointment) {
    setDraft({
      title: apt.title,
      startsAt: toDatetimeLocalValue(apt.startsAt),
      endsAt: apt.endsAt ? toDatetimeLocalValue(apt.endsAt) : "",
      description: apt.description ?? "",
      location: apt.location,
      meetingLink: apt.meetingLink ?? "",
      participantIds: [...apt.participantIds.filter(Boolean)],
      participantDepartmentIds: [...(apt.participantDepartmentIds ?? [])],
      taskId: apt.taskId ?? "",
    });
    descriptionAtEditStartRef.current = apt.description ?? "";
    setDescriptionImagesUploading(false);
    setEditing(true);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }
    if (!draft.startsAt) {
      setError("Start date and time are required.");
      return;
    }
    const startsAt = datetimeLocalToIso(draft.startsAt);
    let endsAt: string | undefined;
    if (draft.endsAt) {
      endsAt = datetimeLocalToIso(draft.endsAt);
      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        setError("End time must be after start time.");
        return;
      }
    }
    if (descriptionImagesUploading) {
      setError("Wait for images to finish uploading.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fields: {
        title: string;
        startsAt: string;
        endsAt?: string;
        location: string;
        participantIds: string[];
        participantDepartmentIds: string[];
        description?: string;
        meetingLink?: string;
        taskId?: string;
      } = {
        title,
        startsAt,
        endsAt,
        location: draft.location.trim(),
        participantIds: [...new Set(draft.participantIds.filter(Boolean))],
        participantDepartmentIds: [...new Set(draft.participantDepartmentIds.filter(Boolean))],
      };
      const taskId = draft.taskId.trim();
      if (taskId) fields.taskId = taskId;
      const description = sanitizeTaskUpdates(draft.description.trim());
      if (richTextHasContent(description)) fields.description = description;
      const meetingLink = draft.meetingLink.trim();
      if (meetingLink) fields.meetingLink = meetingLink;
      if (editing && selected) {
        const patch = { ...fields } as Partial<Appointment>;
        if (!draft.endsAt) patch.endsAt = "";
        if (!richTextHasContent(description)) patch.description = "";
        patch.taskId = taskId;
        if (!taskId) patch.taskId = "";
        await onUpdateAppointment(selected.id, patch);
        descriptionAtEditStartRef.current = description;
        setShowForm(false);
        setEditing(false);
      } else {
        const id = await onCreateAppointment(
          { ...fields, createdById: currentUserId },
          newAppointmentDraftId
        );
        descriptionAtEditStartRef.current = description;
        setShowForm(false);
        setSelectedId(id);
        setNewAppointmentDraftId(newAppointmentDocId());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save appointment");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm("Cancel this appointment?")) return;
    setBusy(true);
    try {
      await onCancelAppointment(id);
      setSelectedId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel appointment");
    } finally {
      setBusy(false);
    }
  }

  const upcomingCount = scoped.filter(
    (a) => isAppointmentScheduled(a) && appointmentStartsAtMs(a) >= nowMs - 60 * 60 * 1000
  ).length;

  function closeForm() {
    discardDraftDescriptionOrphans();
    setShowForm(false);
    setEditing(false);
    setError(null);
  }

  const descriptionStorageDir =
    editing && selected
      ? `appointments/${selected.id}/description`
      : `appointments/${newAppointmentDraftId}/description`;

  return (
    <div className="space-y-4">
      {showForm ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={closeForm}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back
            </button>
          </div>
          <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <h2 className="font-display text-base font-semibold text-slate-900">
            {editing ? "Edit appointment" : "New appointment"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Schedule for yourself, with teammates, or on behalf of others — pick participants below.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Title
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="input-base mt-1 w-full"
                placeholder="e.g. Client kickoff"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Starts
              <input
                type="datetime-local"
                required
                value={draft.startsAt}
                onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                className="input-base mt-1 w-full"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Ends <span className="font-normal text-slate-400">(optional)</span>
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                className="input-base mt-1 w-full"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Participants
              <div className="mt-1">
                <ParticipantMultiSelect
                  people={people}
                  participantIds={draft.participantIds}
                  participantDepartmentIds={draft.participantDepartmentIds}
                  currentUserId={currentUserId}
                  onChange={(participantIds, participantDepartmentIds) =>
                    setDraft((d) => ({ ...d, participantIds, participantDepartmentIds }))
                  }
                />
              </div>
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Linked open task <span className="font-normal text-slate-400">(optional)</span>
              <select
                value={draft.taskId}
                onChange={(e) => setDraft((d) => ({ ...d, taskId: e.target.value }))}
                className="input-base mt-1 w-full"
              >
                <option value="">None</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Location
              <input
                value={draft.location}
                onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                className="input-base mt-1 w-full"
                placeholder="Office, address, or room"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Meeting link <span className="font-normal text-slate-400">(optional)</span>
              <input
                type="text"
                value={draft.meetingLink}
                onChange={(e) => setDraft((d) => ({ ...d, meetingLink: e.target.value }))}
                className="input-base mt-1 w-full"
                placeholder="https://meet.google.com/…"
              />
            </label>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-slate-600">
                Description <span className="font-normal text-slate-400">(optional)</span>
              </p>
              <div className="mt-1">
                <SimpleRichText
                  value={draft.description}
                  onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
                  placeholder="Agenda, notes, prep…"
                  collapseKey={
                    editing && selected
                      ? `appointment-desc-${selected.id}`
                      : `appointment-desc-new-${newAppointmentDraftId}`
                  }
                  inlineImageStorageDir={descriptionStorageDir}
                  onImagesUploadingChange={setDescriptionImagesUploading}
                />
              </div>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || descriptionImagesUploading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600 disabled:opacity-60"
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Create appointment"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
        </>
      ) : (
        <>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {seesAllOrgData ? (
            <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => setScope("my")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                  scope === "my" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
                }`}
              >
                My appointments
              </button>
              <button
                type="button"
                onClick={() => setScope("everyone")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                  scope === "everyone"
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600"
                }`}
              >
                Everyone
              </button>
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-600">My appointments</span>
          )}
          <span className="text-xs text-slate-500">{upcomingCount} upcoming</span>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600"
        >
          New appointment
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_min(100%,360px)] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-inner">
              {(["upcoming", "past", "canceled"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setListTab(t)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize sm:text-sm ${
                    listTab === t ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </span>
            <input
              type="search"
              placeholder="Search appointments…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input-base w-full max-w-xs py-1.5 text-sm"
            />
          </div>

          {sorted.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
              No {listTab} appointments.
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((apt) => {
                const isSelected = apt.id === selectedId;
                const scheduled = isAppointmentScheduled(apt);
                const start = new Date(apt.startsAt);
                const dateLabel = Number.isNaN(start.getTime())
                  ? "—"
                  : formatInOrgTime(start, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      ...(orgDateKey(start).slice(0, 4) !== orgTodayDateKey().slice(0, 4)
                        ? { year: "numeric" as const }
                        : {}),
                    });
                return (
                  <li key={apt.id}>
                    <button
                      ref={(el) => {
                        cardRefs.current[apt.id] = el;
                      }}
                      type="button"
                      onClick={() => setSelectedId(apt.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-emerald-300 bg-emerald-50/90 ring-2 ring-emerald-200"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">{apt.title || "Untitled"}</div>
                          <div className="mt-0.5 text-xs text-slate-600">
                            {dateLabel}
                            {formatAppointmentTimeRange(apt) ? ` · ${formatAppointmentTimeRange(apt)}` : ""}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {formatAppointmentParticipants(apt, people, currentUserId)}
                          </div>
                        </div>
                        {!scheduled && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            Canceled
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selected && (
        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-[calc(3rem+1.25rem)]">
            <div className="space-y-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">{selected.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {formatInOrgTime(selected.startsAt, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {selected.endsAt
                    ? ` – ${formatInOrgTime(selected.endsAt, { hour: "numeric", minute: "2-digit" })}`
                    : ""}
                </p>
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Participants</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {formatAppointmentParticipants(selected, people, currentUserId)}
                  </dd>
                </div>
                {selected.taskId && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Linked task</dt>
                    <dd className="mt-0.5 text-slate-800">
                      {tasks.find((t) => t.id === selected.taskId)?.title ?? selected.taskId}
                    </dd>
                  </div>
                )}
                {selected.createdById && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Created by</dt>
                    <dd className="mt-0.5 text-slate-800">
                      {people.find((p) => p.id === selected.createdById)?.name ?? "—"}
                    </dd>
                  </div>
                )}
                {selected.location && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Location</dt>
                    <dd className="mt-0.5 text-slate-800">{selected.location}</dd>
                  </div>
                )}
                {selected.meetingLink && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Meeting link</dt>
                    <dd className="mt-0.5">
                      <a
                        href={selected.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-medium text-accent hover:underline"
                      >
                        {selected.meetingLink}
                      </a>
                    </dd>
                  </div>
                )}
                {(richTextHasContent(selected.description ?? "") ||
                  (selected.attachments?.length ?? 0) > 0) && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Description
                    </dt>
                    <dd className="mt-0.5 space-y-2 text-slate-800">
                      {richTextHasContent(selected.description ?? "") &&
                        (isStoredRichTextBody(selected.description ?? "") ? (
                          <SimpleRichTextView
                            html={selected.description ?? ""}
                            collapseKey={`appointment-desc-view-${selected.id}`}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap">{selected.description}</p>
                        ))}
                      {(selected.attachments?.length ?? 0) > 0 && (
                        <ImageAttachmentGallery
                          scopeKey={`appointment-${selected.id}`}
                          attachments={selected.attachments}
                        />
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              {isAppointmentScheduled(selected) && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => openEdit(selected)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCancel(selected.id)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                  >
                    Cancel appointment
                  </button>
                </div>
              )}
            </div>
        </aside>
        )}
      </div>
        </>
      )}
    </div>
  );
}
