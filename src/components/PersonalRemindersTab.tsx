import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import { usePersistedFormDraft } from "../hooks/usePersistedFormDraft";
import { clearFormDraft, isShallowDraftEmpty, readFormDraft } from "../utils/formDraftStorage";
import type { Appointment, ImageAttachment, PersonalReminder, Person, SalesContact, Task } from "../types";
import { deleteImagesFromStorage } from "../utils/imageAttachments";
import { ParticipantMultiSelect } from "./ParticipantMultiSelect";
import {
  formatPersonalReminderParticipants,
  isPersonalReminderRelevantToPerson,
} from "../utils/personalReminderLinks";
import { personDisplayName } from "../utils/appointments";
import { newPersonalReminderDocId } from "../firebase/firestoreIds";
import { contactDisplayName } from "../utils/contactDuplicates";
import { isAppointmentScheduled } from "../utils/appointments";
import { isTaskOpen } from "../utils/personTaskStats";
import { isReminderOverdue } from "../utils/salesUrgency";
import {
  datetimeLocalToIso,
  defaultOrgDatetimeLocal,
  formatInOrgTime,
  toDatetimeLocalValue,
} from "../utils/orgTimezone";
import { ConfirmPanel } from "./TaskWorkerActions";
import { InlineImageAttachments } from "./InlineImageAttachments";
import { ImageAttachmentGallery } from "./ImageAttachmentGallery";

type ReminderListTab = "open" | "done";

const REMINDERS_DRAFT_KEY = "reminders:form";

function isReminderDraftEmpty(draft: Draft): boolean {
  return isShallowDraftEmpty(draft as unknown as Record<string, unknown>);
}

const REMINDERS_VIEW_DEFAULTS = {
  listTab: "open" as ReminderListTab,
  selectedId: "",
};

type Draft = {
  title: string;
  dueAt: string;
  notes: string;
  contactId: string;
  taskId: string;
  appointmentId: string;
  participantIds: string[];
  participantDepartmentIds: string[];
};

function emptyDraft(): Draft {
  return {
    title: "",
    dueAt: defaultOrgDatetimeLocal(24),
    notes: "",
    contactId: "",
    taskId: "",
    appointmentId: "",
    participantIds: [],
    participantDepartmentIds: [],
  };
}

function Labeled({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-medium text-slate-600 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function PersonalRemindersTab({
  reminders,
  people,
  contacts,
  tasks,
  appointments,
  currentUserId,
  onAddReminder,
  onUpdateReminder,
  onRemoveReminder,
  onOpenContact,
  onOpenTask,
  onOpenAppointment,
  focusReminderId,
  onFocusReminderHandled,
}: {
  reminders: PersonalReminder[];
  people: Person[];
  contacts: SalesContact[];
  tasks: Task[];
  appointments: Appointment[];
  currentUserId: string;
  onAddReminder: (
    payload: Omit<PersonalReminder, "id" | "createdAt" | "done">,
    reminderId?: string
  ) => Promise<string>;
  onUpdateReminder: (id: string, patch: Partial<PersonalReminder>) => void | Promise<void>;
  onRemoveReminder: (id: string) => void | Promise<void>;
  onOpenContact: (contactId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenAppointment: (appointmentId: string) => void;
  focusReminderId?: string | null;
  onFocusReminderHandled?: () => void;
}) {
  const saved = useMemo(() => readPersistedTabState("reminders", REMINDERS_VIEW_DEFAULTS), []);
  const savedForm = useMemo(() => readFormDraft<Draft>(REMINDERS_DRAFT_KEY), []);
  const [selectedId, setSelectedId] = useState(() =>
    savedForm?.editId && (savedForm.editing || savedForm.open) ? savedForm.editId : saved.selectedId
  );
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showForm, setShowForm] = useState(() => Boolean(savedForm?.open));
  const [draft, setDraft] = useState(() => (savedForm?.data ? { ...savedForm.data } : emptyDraft()));
  const [draftId, setDraftId] = useState(() => newPersonalReminderDocId());
  const [draftAttachments, setDraftAttachments] = useState<ImageAttachment[]>([]);
  const [editing, setEditing] = useState(() => Boolean(savedForm?.editing));
  const [draftUploading, setDraftUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listTab, setListTab] = useState<ReminderListTab>(() => saved.listTab);
  const [reopenOpen, setReopenOpen] = useState(false);
  const draftAttachmentsRef = useRef<ImageAttachment[]>([]);
  const draftSubmittedRef = useRef(false);
  draftAttachmentsRef.current = draftAttachments;

  usePersistedTabState("reminders", { listTab, selectedId });

  usePersistedFormDraft(
    REMINDERS_DRAFT_KEY,
    {
      open: showForm,
      editing,
      editId: editing ? selectedId : undefined,
      data: draft,
    },
    { isEmpty: isReminderDraftEmpty }
  );

  useEffect(() => {
    if (!showForm) return;
    draftSubmittedRef.current = false;
    return () => {
      if (draftSubmittedRef.current) return;
      const orphans = draftAttachmentsRef.current;
      if (orphans.length > 0) {
        void deleteImagesFromStorage(orphans.map((a) => a.storagePath));
      }
    };
  }, [showForm, draftId]);

  const visible = useMemo(
    () => reminders.filter((r) => isPersonalReminderRelevantToPerson(r, currentUserId, people)),
    [reminders, currentUserId, people]
  );

  const openTasks = useMemo(() => tasks.filter((t) => isTaskOpen(t)), [tasks]);
  const scheduledAppointments = useMemo(
    () => appointments.filter((a) => isAppointmentScheduled(a)),
    [appointments]
  );

  const reminderStats = useMemo(() => {
    let open = 0;
    let overdue = 0;
    let done = 0;
    for (const r of visible) {
      if (r.done) done += 1;
      else {
        open += 1;
        if (isReminderOverdue(r.dueAt, r.done)) overdue += 1;
      }
    }
    return { open, overdue, done };
  }, [visible]);

  const filtered = useMemo(
    () => visible.filter((r) => (listTab === "open" ? !r.done : r.done)),
    [visible, listTab]
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        listTab === "done" ? b.dueAt.localeCompare(a.dueAt) : a.dueAt.localeCompare(b.dueAt)
      ),
    [filtered, listTab]
  );

  const selected = useMemo(
    () => (selectedId ? visible.find((r) => r.id === selectedId) : undefined),
    [visible, selectedId]
  );

  useEffect(() => {
    if (!selectedId) return;
    const r = visible.find((x) => x.id === selectedId);
    if (!r) {
      setSelectedId("");
      return;
    }
    if ((listTab === "open" && r.done) || (listTab === "done" && !r.done)) {
      setSelectedId("");
    }
  }, [selectedId, visible, listTab]);

  useEffect(() => {
    setReopenOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (!focusReminderId) return;
    const r = visible.find((x) => x.id === focusReminderId);
    if (!r) {
      onFocusReminderHandled?.();
      return;
    }
    setListTab(r.done ? "done" : "open");
    setShowForm(false);
    setSelectedId(focusReminderId);
    requestAnimationFrame(() => {
      cardRefs.current[focusReminderId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    onFocusReminderHandled?.();
  }, [focusReminderId, visible, onFocusReminderHandled]);

  function ownerLabel(ownerId: string) {
    if (ownerId === currentUserId) return "you";
    const p = people.find((x) => x.id === ownerId);
    return p ? personDisplayName(p) : "Unknown";
  }

  function contactLabel(id: string) {
    const c = contacts.find((x) => x.id === id);
    return c ? contactDisplayName(c) : "Contact";
  }

  function taskLabel(id: string) {
    return tasks.find((t) => t.id === id)?.title ?? "Task";
  }

  function appointmentLabel(id: string) {
    const a = appointments.find((x) => x.id === id);
    if (!a) return "Appointment";
    return `${a.title} · ${formatInOrgTime(a.startsAt, { dateStyle: "short", timeStyle: "short" })}`;
  }

  function openNew() {
    setDraft(emptyDraft());
    setDraftAttachments([]);
    setDraftId(newPersonalReminderDocId());
    setShowForm(true);
    setEditing(false);
    setSelectedId("");
  }

  function openDetail(r: PersonalReminder) {
    setShowForm(false);
    setEditing(false);
    setSelectedId(r.id);
  }

  function startEdit(r: PersonalReminder) {
    setDraft({
      title: r.title,
      dueAt: toDatetimeLocalValue(r.dueAt),
      notes: r.notes,
      contactId: r.contactId ?? "",
      taskId: r.taskId ?? "",
      appointmentId: r.appointmentId ?? "",
      participantIds: [...r.participantIds],
      participantDepartmentIds: [...r.participantDepartmentIds],
    });
    setEditing(true);
    setShowForm(false);
    setSelectedId(r.id);
  }

  async function submitNew(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim() || submitting || draftUploading) return;
    setSubmitting(true);
    try {
      const id = await onAddReminder(
        {
          ownerId: currentUserId,
          title: draft.title.trim(),
          dueAt: datetimeLocalToIso(draft.dueAt),
          notes: draft.notes.trim(),
          contactId: draft.contactId || undefined,
          taskId: draft.taskId || undefined,
          appointmentId: draft.appointmentId || undefined,
          participantIds: draft.participantIds,
          participantDepartmentIds: draft.participantDepartmentIds,
          ...(draftAttachments.length > 0 ? { attachments: draftAttachments } : {}),
        },
        draftId
      );
      draftSubmittedRef.current = true;
      clearFormDraft(REMINDERS_DRAFT_KEY);
      setShowForm(false);
      setSelectedId(id);
      setDraft(emptyDraft());
      setDraftAttachments([]);
      setDraftId(newPersonalReminderDocId());
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!selected || !draft.title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onUpdateReminder(selected.id, {
        title: draft.title.trim(),
        dueAt: datetimeLocalToIso(draft.dueAt),
        notes: draft.notes.trim(),
        contactId: draft.contactId,
        taskId: draft.taskId,
        appointmentId: draft.appointmentId,
        participantIds: draft.participantIds,
        participantDepartmentIds: draft.participantDepartmentIds,
      });
      clearFormDraft(REMINDERS_DRAFT_KEY);
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function AssociationFields({
    value,
    onChange,
    disabled,
  }: {
    value: Draft;
    onChange: (patch: Partial<Draft>) => void;
    disabled?: boolean;
  }) {
    const apt = value.appointmentId
      ? appointments.find((a) => a.id === value.appointmentId)
      : undefined;
    const inheritedTaskId = apt?.taskId ?? "";

    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Contact">
          <select
            value={value.contactId}
            disabled={disabled}
            onChange={(e) => onChange({ contactId: e.target.value })}
            className="input-base w-full"
          >
            <option value="">None</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {contactDisplayName(c)}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Open task">
          <select
            value={inheritedTaskId || value.taskId}
            disabled={disabled || Boolean(inheritedTaskId)}
            onChange={(e) => onChange({ taskId: e.target.value, appointmentId: "" })}
            className="input-base w-full"
          >
            <option value="">None</option>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          {inheritedTaskId && (
            <p className="mt-1 text-[10px] text-slate-500">From linked appointment</p>
          )}
        </Labeled>
        <Labeled label="Appointment" className="sm:col-span-2">
          <select
            value={value.appointmentId}
            disabled={disabled}
            onChange={(e) => onChange({ appointmentId: e.target.value })}
            className="input-base w-full"
          >
            <option value="">None</option>
            {scheduledAppointments.map((a) => (
              <option key={a.id} value={a.id}>
                {appointmentLabel(a.id)}
              </option>
            ))}
          </select>
        </Labeled>
      </div>
    );
  }

  function LinkChips({ r }: { r: PersonalReminder }) {
    if (!r.contactId && !r.taskId && !r.appointmentId) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {r.contactId && (
          <button
            type="button"
            onClick={() => onOpenContact(r.contactId!)}
            className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-900 ring-1 ring-teal-200 hover:bg-teal-100"
          >
            {contactLabel(r.contactId)}
          </button>
        )}
        {r.taskId && (
          <button
            type="button"
            onClick={() => onOpenTask(r.taskId!)}
            className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-900 ring-1 ring-indigo-200 hover:bg-indigo-100"
          >
            {taskLabel(r.taskId)}
          </button>
        )}
        {r.appointmentId && (
          <button
            type="button"
            onClick={() => onOpenAppointment(r.appointmentId!)}
            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100"
          >
            {appointmentLabel(r.appointmentId)}
          </button>
        )}
      </div>
    );
  }

  function ReminderListItem({ r }: { r: PersonalReminder }) {
    const active = selectedId === r.id && !showForm;
    const overdue = isReminderOverdue(r.dueAt, r.done);
    return (
      <li>
        <div ref={(el) => { cardRefs.current[r.id] = el; }}>
        <button
          type="button"
          onClick={() => openDetail(r)}
          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
            active
              ? "border-violet-300 bg-violet-50/90 shadow-sm"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <p className="truncate text-sm font-semibold text-slate-900">{r.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatInOrgTime(r.dueAt, { dateStyle: "medium", timeStyle: "short" })}
            {overdue && !r.done && <span className="ml-2 font-semibold text-rose-700">Overdue</span>}
            {r.done && <span className="ml-2 font-medium text-emerald-700">Done</span>}
          </p>
        </button>
        </div>
      </li>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
      <aside className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">Reminders</h2>
              <div
                className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-tight text-slate-500 sm:gap-x-2 sm:text-xs"
                aria-label="Reminders summary"
              >
                <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                  <span className="tabular-nums font-semibold text-violet-700">{reminderStats.open}</span>
                  <span className="font-normal">Open</span>
                </span>
                <span className="px-0.5 text-slate-300" aria-hidden>
                  |
                </span>
                <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                  <span className="tabular-nums font-semibold text-rose-700">{reminderStats.overdue}</span>
                  <span className="font-normal">Overdue</span>
                </span>
                <span className="px-0.5 text-slate-300" aria-hidden>
                  |
                </span>
                <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                  <span className="tabular-nums font-semibold text-emerald-700">{reminderStats.done}</span>
                  <span className="font-normal">Done</span>
                </span>
              </div>
            </div>
            <span className="inline-flex rounded-lg border border-slate-200 bg-violet-100/80 p-0.5 shadow-inner">
              {(
                [
                  ["open", "Open"],
                  ["done", "Done"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setListTab(tab)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                    listTab === tab ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={openNew}
              className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
            >
              Add
            </button>
          )}
        </div>

        {sorted.length > 0 ? (
          <ul className="space-y-1.5">
            {sorted.map((r) => (
              <ReminderListItem key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
            {visible.length === 0
              ? "No personal reminders yet."
              : listTab === "open"
                ? "No open reminders."
                : "No done reminders yet."}
          </p>
        )}
      </aside>

      {showForm ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <header className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-display text-xl font-semibold text-slate-900">New reminder</h3>
              <p className="mt-1 text-sm text-slate-500">Yours or shared with teammates — link to contacts, tasks, or appointments.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </header>
          <form onSubmit={submitNew} className="mt-5 space-y-4">
            <Labeled label="What to do">
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="input-base w-full"
                placeholder="e.g. Send proposal"
              />
            </Labeled>
            <Labeled label="Due">
              <input
                type="datetime-local"
                required
                value={draft.dueAt}
                onChange={(e) => setDraft((d) => ({ ...d, dueAt: e.target.value }))}
                className="input-base w-full"
              />
            </Labeled>
            <Labeled label="Notes">
              <div className="relative">
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  rows={3}
                  className="input-base min-h-[72px] w-full resize-y pb-10"
                />
                <InlineImageAttachments
                  storageDir={`personalReminders/${draftId}`}
                  attachments={draftAttachments}
                  onAttachmentsChange={setDraftAttachments}
                  onUploadingChange={setDraftUploading}
                  disabled={submitting}
                />
              </div>
            </Labeled>
            <Labeled label="Include others">
              <ParticipantMultiSelect
                people={people}
                participantIds={draft.participantIds}
                participantDepartmentIds={draft.participantDepartmentIds}
                currentUserId={currentUserId}
                onChange={(participantIds, participantDepartmentIds) =>
                  setDraft((d) => ({ ...d, participantIds, participantDepartmentIds }))
                }
                placeholder="Just me"
              />
            </Labeled>
            <AssociationFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={!draft.title.trim() || submitting || draftUploading}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save reminder
              </button>
            </div>
          </form>
        </section>
      ) : selected ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {editing ? (
            <form onSubmit={saveEdit} className="space-y-4">
              <header className="border-b border-slate-100 pb-4">
                <h3 className="font-display text-xl font-semibold text-slate-900">Edit reminder</h3>
              </header>
              <Labeled label="What to do">
                <input
                  required
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="input-base w-full"
                />
              </Labeled>
              <Labeled label="Due">
                <input
                  type="datetime-local"
                  required
                  value={draft.dueAt}
                  onChange={(e) => setDraft((d) => ({ ...d, dueAt: e.target.value }))}
                  className="input-base w-full"
                />
              </Labeled>
              <Labeled label="Notes">
                <div className="relative">
                  <textarea
                    value={draft.notes}
                    onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    rows={3}
                    className="input-base min-h-[72px] w-full resize-y pb-10"
                  />
                  <InlineImageAttachments
                    storageDir={`personalReminders/${selected.id}`}
                    attachments={selected.attachments ?? []}
                    onAttachmentsChange={(attachments) => {
                      void Promise.resolve(onUpdateReminder(selected.id, { attachments })).catch(console.error);
                    }}
                    onUploadingChange={setDraftUploading}
                    disabled={submitting}
                  />
                </div>
              </Labeled>
              <Labeled label="Include others">
                <ParticipantMultiSelect
                  people={people}
                  participantIds={draft.participantIds}
                  participantDepartmentIds={draft.participantDepartmentIds}
                  currentUserId={currentUserId}
                  onChange={(participantIds, participantDepartmentIds) =>
                    setDraft((d) => ({ ...d, participantIds, participantDepartmentIds }))
                  }
                  placeholder="Just me"
                />
              </Labeled>
              <AssociationFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={submitting || draftUploading}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-display text-xl font-semibold text-slate-900">{selected.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Due {formatInOrgTime(selected.dueAt, { dateStyle: "medium", timeStyle: "short" })}
                    {selected.done ? (
                      <span className="ml-2 font-medium text-emerald-700">Done</span>
                    ) : isReminderOverdue(selected.dueAt, selected.done) ? (
                      <span className="ml-2 font-semibold text-rose-700">Overdue</span>
                    ) : null}
                  </p>
                  <LinkChips r={selected} />
                  <p className="mt-2 text-xs text-slate-500">
                    Created by <span className="font-medium text-slate-700">{ownerLabel(selected.ownerId)}</span>
                    {(selected.participantIds.length > 0 || selected.participantDepartmentIds.length > 0) && (
                      <>
                        {" "}
                        · Shared with{" "}
                        <span className="font-medium text-slate-700">
                          {formatPersonalReminderParticipants(selected, people, currentUserId)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!selected.done ? (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(selected)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void Promise.resolve(onUpdateReminder(selected.id, { done: true }))
                            .then(() => setSelectedId(""))
                            .catch(console.error);
                        }}
                        className="rounded-xl border border-emerald-800/50 bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-emerald-950 ring-1 ring-emerald-800/35 hover:bg-emerald-900/30"
                      >
                        Mark done
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("Delete this reminder?")) return;
                          void Promise.resolve(onRemoveReminder(selected.id)).then(() => setSelectedId(""));
                        }}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    !reopenOpen && (
                      <button
                        type="button"
                        onClick={() => setReopenOpen(true)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Reopen
                      </button>
                    )
                  )}
                </div>
              </header>
              {reopenOpen && selected.done && (
                <div className="mt-3">
                  <ConfirmPanel
                    message="Reopen this reminder? It will move back to Open."
                    yesLabel="Yes, reopen"
                    noLabel="Keep done"
                    onYes={() => {
                      void Promise.resolve(onUpdateReminder(selected.id, { done: false }))
                        .then(() => {
                          setReopenOpen(false);
                          setListTab("open");
                        })
                        .catch(console.error);
                    }}
                    onNo={() => setReopenOpen(false)}
                  />
                </div>
              )}
              {(selected.notes.trim() || (selected.attachments?.length ?? 0) > 0) && (
                <div className="mt-4 space-y-2">
                  {selected.notes.trim() && (
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{selected.notes}</p>
                  )}
                  {(selected.attachments?.length ?? 0) > 0 && (
                    <ImageAttachmentGallery
                      scopeKey={`personal-reminder-${selected.id}`}
                      attachments={selected.attachments}
                      size="sm"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
          Select a reminder or add a new one.
        </div>
      )}
    </div>
  );
}
