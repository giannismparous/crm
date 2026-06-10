import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import { usePersistedFormDraft } from "../hooks/usePersistedFormDraft";
import { clearFormDraft, isShallowDraftEmpty, readFormDraft } from "../utils/formDraftStorage";
import { Plus, Trash2 } from "lucide-react";
import type { Appointment, Person, Project, Task, TaskListScope, TaskPriority } from "../types";
import { isTaskOpen } from "../utils/personTaskStats";
import { reviewItemsForSearch } from "../utils/appointmentReview";
import { sanitizeTaskUpdates } from "../utils/sanitizeRichText";
import { newAppointmentDocId } from "../firebase/firestoreIds";
import { deleteImagesFromStorage } from "../utils/imageAttachments";
import { isStoredRichTextBody, richTextHasContent, storagePathsInUpdatesHtml } from "../utils/richTextImages";
import { taskUpdatesToPlainText } from "../utils/sanitizeRichText";
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
import { syncCrmItemToGoogleCalendar } from "../firebase/googleCalendar";

type AppointmentListTab = "upcoming" | "past" | "canceled";

const APPOINTMENTS_DRAFT_KEY = "appointments:form";

const APPOINTMENTS_VIEW_DEFAULTS = {
  scope: "my" as TaskListScope,
  listTab: "upcoming" as AppointmentListTab,
  query: "",
  selectedId: "",
};

type AppointmentTaskDraft = {
  id: string;
  title: string;
  dueDate: string;
  assigneeIds: string[];
  assigneeDepartmentIds: string[];
  projectId: string;
  priority: TaskPriority;
};

type AppointmentDraft = {
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
  reviewItems: string[];
  location: string;
  meetingLink: string;
  participantIds: string[];
  participantDepartmentIds: string[];
  linkedTaskIds: string[];
  newTasks: AppointmentTaskDraft[];
};

function isAppointmentDraftEmpty(draft: AppointmentDraft): boolean {
  if (draft.linkedTaskIds.length > 0 || draft.newTasks.length > 0) return false;
  if (draft.reviewItems.some((x) => x.trim())) return false;
  const { linkedTaskIds: _l, newTasks: _n, reviewItems: _r, ...rest } = draft;
  return isShallowDraftEmpty(rest as unknown as Record<string, unknown>);
}

function normalizeReviewDraftItems(items: string[]): string[] {
  return [...new Set(items.map((x) => x.trim()).filter(Boolean))];
}

function dueDateFromStartsLocal(startsAtLocal: string): string {
  if (!startsAtLocal.trim()) return orgTodayDateKey();
  try {
    return orgDateKey(datetimeLocalToIso(startsAtLocal));
  } catch {
    return orgTodayDateKey();
  }
}

function emptyTaskDraft(startsAtLocal: string, participantIds: string[]): AppointmentTaskDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    dueDate: dueDateFromStartsLocal(startsAtLocal),
    assigneeIds: [...participantIds],
    assigneeDepartmentIds: [],
    projectId: "",
    priority: "medium",
  };
}

function emptyDraft(currentUserId: string): AppointmentDraft {
  const startsAt = defaultStartsAt();
  return {
    title: "",
    startsAt,
    endsAt: "",
    description: "",
    reviewItems: [],
    location: "",
    meetingLink: "",
    participantIds: currentUserId ? [currentUserId] : [],
    participantDepartmentIds: [],
    linkedTaskIds: [],
    newTasks: [],
  };
}

function linkedTaskIdsForAppointment(apt: Appointment, allTasks: Task[]): string[] {
  return tasksForAppointment(apt, allTasks).map((t) => t.id);
}

function ReviewItemsEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">What to review</p>
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Add item
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-slate-500">List what should be reviewed or ready beforehand.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="w-3 shrink-0 text-center text-sm font-bold leading-none text-slate-400" aria-hidden>
                •
              </span>
              <input
                value={item}
                onChange={(e) =>
                  onChange(items.map((v, i) => (i === index ? e.target.value : v)))
                }
                className="input-base min-w-0 flex-1 py-1.5"
                placeholder="e.g. Signed contract"
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove item ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isTaskLinkableForAppointment(task: Task, today: string, appointmentId?: string): boolean {
  if (!isTaskOpen(task)) return false;
  const due = task.dueDate?.trim().slice(0, 10);
  if (!due || due < today) return false;
  const linkedApt = task.appointmentId?.trim();
  const aptId = appointmentId?.trim();
  if (linkedApt && aptId && linkedApt !== aptId) return false;
  return true;
}

function ExistingTasksLinker({
  tasks,
  selectedIds,
  appointmentId,
  onChange,
}: {
  tasks: Task[];
  selectedIds: string[];
  appointmentId?: string;
  onChange: (ids: string[]) => void;
}) {
  const options = useMemo(() => {
    const aptId = appointmentId?.trim();
    const today = orgTodayDateKey();
    return tasks
      .filter(
        (t) =>
          (isTaskLinkableForAppointment(t, today, aptId) || selectedIds.includes(t.id)) &&
          (!t.appointmentId || !aptId || t.appointmentId === aptId || selectedIds.includes(t.id))
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, appointmentId, selectedIds]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  if (options.length === 0) {
    return <p className="text-[11px] text-slate-500">No open tasks available to link.</p>;
  }

  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5">
      {options.map((t) => {
        const checked = selectedIds.includes(t.id);
        return (
          <li key={t.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(t.id)}
                className="rounded border-slate-300 text-accent focus:ring-accent/30"
              />
              <span className="min-w-0 truncate text-sm text-slate-800">{t.title || "Untitled task"}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function tasksForAppointment(apt: Appointment, allTasks: Task[]): Task[] {
  const explicit = [...new Set((apt.linkedTaskIds ?? []).map((x) => x.trim()).filter(Boolean))];
  if (explicit.length > 0) {
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    return explicit.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t));
  }
  const byLink = allTasks.filter((t) => t.appointmentId === apt.id);
  const seen = new Set(byLink.map((t) => t.id));
  if (apt.taskId && !seen.has(apt.taskId)) {
    const legacy = allTasks.find((t) => t.id === apt.taskId);
    if (legacy) return [legacy, ...byLink];
  }
  return byLink;
}

function defaultStartsAt(): string {
  return defaultOrgDatetimeLocal(1);
}

export function AppointmentsTab({
  appointments,
  allTasks,
  projects,
  people,
  currentUserId,
  seesAllOrgData = true,
  onCreateAppointment,
  onUpdateAppointment,
  onCancelAppointment,
  onCreateTask,
  onUpdateTask,
  onOpenTask,
  focusAppointmentId,
  onFocusAppointmentHandled,
}: {
  appointments: Appointment[];
  /** All org tasks — link picker and linked-task display. */
  allTasks: Task[];
  projects: Project[];
  people: Person[];
  currentUserId: string;
  seesAllOrgData?: boolean;
  onCreateAppointment: (
    payload: Omit<Appointment, "id" | "createdAt" | "status">,
    appointmentId?: string,
    options?: { skipCalendarSync?: boolean }
  ) => Promise<string>;
  onUpdateAppointment: (
    id: string,
    patch: Partial<Appointment>,
    options?: { skipCalendarSync?: boolean }
  ) => Promise<void>;
  onCancelAppointment: (id: string) => Promise<void>;
  onCreateTask: (
    payload: Omit<Task, "id" | "createdAt">,
    options?: { skipCalendarSync?: boolean }
  ) => Promise<string>;
  onUpdateTask: (
    id: string,
    patch: Partial<Task>,
    options?: { skipCalendarSync?: boolean }
  ) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  focusAppointmentId?: string | null;
  onFocusAppointmentHandled?: () => void;
}) {
  const saved = useMemo(() => readPersistedTabState("appointments", APPOINTMENTS_VIEW_DEFAULTS), []);
  const savedForm = useMemo(() => readFormDraft<AppointmentDraft>(APPOINTMENTS_DRAFT_KEY), []);
  const [scope, setScope] = useState<TaskListScope>(() => saved.scope);
  const [listTab, setListTab] = useState<AppointmentListTab>(() => saved.listTab);
  const [query, setQuery] = useState(() => saved.query);
  const [showForm, setShowForm] = useState(() => Boolean(savedForm?.open));
  const [draft, setDraft] = useState(() =>
    savedForm?.data ? { ...savedForm.data } : emptyDraft(currentUserId)
  );
  const [selectedId, setSelectedId] = useState(() =>
    savedForm?.editId && savedForm.open ? savedForm.editId : saved.selectedId
  );
  const [editing, setEditing] = useState(() => Boolean(savedForm?.editing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionImagesUploading, setDescriptionImagesUploading] = useState(false);
  const [newAppointmentDraftId, setNewAppointmentDraftId] = useState(newAppointmentDocId);
  const descriptionAtEditStartRef = useRef("");
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  usePersistedTabState("appointments", { scope, listTab, query, selectedId });

  usePersistedFormDraft(
    APPOINTMENTS_DRAFT_KEY,
    {
      open: showForm,
      editing,
      editId: editing ? selectedId : undefined,
      data: draft,
    },
    { isEmpty: isAppointmentDraftEmpty }
  );

  const nowMs = Date.now();

  const scoped = useMemo(() => {
    const base =
      scope === "my" && currentUserId && seesAllOrgData
        ? appointments.filter((a) => isAppointmentRelevantToPerson(a, currentUserId, people))
        : appointments;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => {
      const blob =
        `${a.title} ${reviewItemsForSearch(a.reviewItems)} ${taskUpdatesToPlainText(sanitizeTaskUpdates(a.description ?? ""))} ${a.location} ${a.meetingLink}`.toLowerCase();
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
      reviewItems: apt.reviewItems?.length ? [...apt.reviewItems] : [],
      location: apt.location,
      meetingLink: apt.meetingLink ?? "",
      participantIds: [...apt.participantIds.filter(Boolean)],
      participantDepartmentIds: [...(apt.participantDepartmentIds ?? [])],
      linkedTaskIds: linkedTaskIdsForAppointment(apt, allTasks),
      newTasks: [],
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
        reviewItems?: string[];
        meetingLink?: string;
      } = {
        title,
        startsAt,
        endsAt,
        location: draft.location.trim(),
        participantIds: [...new Set(draft.participantIds.filter(Boolean))],
        participantDepartmentIds: [...new Set(draft.participantDepartmentIds.filter(Boolean))],
      };
      const description = sanitizeTaskUpdates(draft.description.trim());
      if (richTextHasContent(description)) fields.description = description;
      const reviewItems = normalizeReviewDraftItems(draft.reviewItems);
      fields.reviewItems = reviewItems;
      const meetingLink = draft.meetingLink.trim();
      if (meetingLink) fields.meetingLink = meetingLink;

      const taskDrafts = draft.newTasks
        .map((t) => ({ ...t, title: t.title.trim() }))
        .filter((t) => t.title.length > 0);
      const desiredLinked = [...new Set(draft.linkedTaskIds.filter(Boolean))];
      const previousLinked =
        editing && selected
          ? new Set(linkedTaskIdsForAppointment(selected, allTasks))
          : new Set<string>();
      const syncOpts = { skipCalendarSync: true as const };

      let appointmentId: string;
      if (editing && selected) {
        const patch = { ...fields, linkedTaskIds: desiredLinked } as Partial<Appointment>;
        if (!draft.endsAt) patch.endsAt = "";
        if (!richTextHasContent(description)) patch.description = "";
        patch.reviewItems = reviewItems;
        await onUpdateAppointment(selected.id, patch, syncOpts);
        appointmentId = selected.id;
        descriptionAtEditStartRef.current = description;
        setShowForm(false);
        setEditing(false);
      } else {
        appointmentId = await onCreateAppointment(
          { ...fields, linkedTaskIds: desiredLinked, createdById: currentUserId },
          newAppointmentDraftId,
          syncOpts
        );
        descriptionAtEditStartRef.current = description;
        setShowForm(false);
        setSelectedId(appointmentId);
        setNewAppointmentDraftId(newAppointmentDocId());
      }

      for (const taskId of desiredLinked) {
        const task = allTasks.find((t) => t.id === taskId);
        if (task && task.appointmentId !== appointmentId) {
          await onUpdateTask(taskId, { appointmentId }, syncOpts);
        }
      }
      for (const taskId of previousLinked) {
        if (!desiredLinked.includes(taskId)) {
          await onUpdateTask(taskId, { appointmentId: "" }, syncOpts);
        }
      }

      for (const taskDraft of taskDrafts) {
        const payload: Omit<Task, "id" | "createdAt"> = {
          title: taskDraft.title,
          description: "",
          assigneeIds: [...new Set(taskDraft.assigneeIds.filter(Boolean))],
          assigneeDepartmentIds: [...new Set(taskDraft.assigneeDepartmentIds.filter(Boolean))],
          finishedByIds: [],
          feedbackByIds: [],
          feedbackRequests: [],
          assignedById: currentUserId,
          status: "todo",
          priority: taskDraft.priority,
          dueDate: taskDraft.dueDate || dueDateFromStartsLocal(draft.startsAt),
          originalDueDate: taskDraft.dueDate || dueDateFromStartsLocal(draft.startsAt),
          postponeCount: 0,
          needsFeedback: false,
          updates: "",
          updatesByUser: {},
          updateEntries: [],
          comments: [],
          appointmentId,
        };
        const pid = taskDraft.projectId.trim();
        if (pid) payload.projectId = pid;
        const newId = await onCreateTask(payload, syncOpts);
        desiredLinked.push(newId);
      }

      if (taskDrafts.length > 0) {
        await onUpdateAppointment(appointmentId, { linkedTaskIds: desiredLinked }, syncOpts);
      }

      void syncCrmItemToGoogleCalendar("appointment", appointmentId);
      for (const taskId of desiredLinked) {
        void syncCrmItemToGoogleCalendar("task", taskId);
      }
      clearFormDraft(APPOINTMENTS_DRAFT_KEY);
      setDraft(emptyDraft(currentUserId));
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
            <ReviewItemsEditor
              items={draft.reviewItems}
              onChange={(reviewItems) => setDraft((d) => ({ ...d, reviewItems }))}
            />
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

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
              <p className="text-xs font-semibold text-slate-800">Tasks for this appointment</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Link existing open tasks and/or create new ones for this meeting.
              </p>

              <div className="mt-3">
                <p className="text-[11px] font-semibold text-slate-700">Link existing tasks</p>
                <div className="mt-1.5">
                  <ExistingTasksLinker
                    tasks={allTasks}
                    selectedIds={draft.linkedTaskIds}
                    appointmentId={editing && selected ? selected.id : newAppointmentDraftId}
                    onChange={(linkedTaskIds) => setDraft((d) => ({ ...d, linkedTaskIds }))}
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200/80 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-slate-700">Create new tasks</p>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        newTasks: [...d.newTasks, emptyTaskDraft(d.startsAt, d.participantIds)],
                      }))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    New task
                  </button>
                </div>

              {draft.newTasks.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-500">No new tasks — add one if you need fresh prep work tracked.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {draft.newTasks.map((taskDraft, index) => (
                    <li
                      key={taskDraft.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          Task {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              newTasks: d.newTasks.filter((t) => t.id !== taskDraft.id),
                            }))
                          }
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Remove task ${index + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                          Title
                          <input
                            value={taskDraft.title}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((t) =>
                                  t.id === taskDraft.id ? { ...t, title: e.target.value } : t
                                ),
                              }))
                            }
                            className="input-base mt-1 w-full py-1.5"
                            placeholder="e.g. Prepare demo environment"
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-600">
                          Due
                          <input
                            type="date"
                            value={taskDraft.dueDate}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((t) =>
                                  t.id === taskDraft.id ? { ...t, dueDate: e.target.value } : t
                                ),
                              }))
                            }
                            className="input-base mt-1 w-full py-1.5"
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-600">
                          Priority
                          <select
                            value={taskDraft.priority}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((t) =>
                                  t.id === taskDraft.id
                                    ? { ...t, priority: e.target.value as TaskPriority }
                                    : t
                                ),
                              }))
                            }
                            className="input-base mt-1 w-full py-1.5"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                          Project <span className="font-normal text-slate-400">(optional)</span>
                          <select
                            value={taskDraft.projectId}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((t) =>
                                  t.id === taskDraft.id ? { ...t, projectId: e.target.value } : t
                                ),
                              }))
                            }
                            className="input-base mt-1 w-full py-1.5"
                          >
                            <option value="">No project</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="sm:col-span-2">
                          <span className="mb-1 block text-xs font-medium text-slate-600">Assign to</span>
                          <ParticipantMultiSelect
                            people={people}
                            participantIds={taskDraft.assigneeIds}
                            participantDepartmentIds={taskDraft.assigneeDepartmentIds}
                            currentUserId={currentUserId}
                            onChange={(assigneeIds, assigneeDepartmentIds) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((t) =>
                                  t.id === taskDraft.id
                                    ? { ...t, assigneeIds, assigneeDepartmentIds }
                                    : t
                                ),
                              }))
                            }
                            placeholder="Choose assignees…"
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
                {(selected.reviewItems?.length ?? 0) > 0 && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      What to review
                    </dt>
                    <dd className="mt-1">
                      <ul className="list-disc space-y-0.5 pl-4 text-slate-800">
                        {selected.reviewItems!.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                {(() => {
                  const linked = tasksForAppointment(selected, allTasks);
                  if (linked.length === 0) return null;
                  return (
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tasks</dt>
                      <dd className="mt-1 space-y-1">
                        {linked.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => onOpenTask(t.id)}
                            className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-left text-sm font-medium text-accent hover:bg-accent/5"
                          >
                            {t.title || "Untitled task"}
                          </button>
                        ))}
                      </dd>
                    </div>
                  );
                })()}
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
