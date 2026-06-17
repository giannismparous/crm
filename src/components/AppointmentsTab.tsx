import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import { usePersistedFormDraft } from "../hooks/usePersistedFormDraft";
import { clearFormDraft, isShallowDraftEmpty, readFormDraft } from "../utils/formDraftStorage";
import { Plus, Trash2 } from "lucide-react";
import type { Appointment, AppointmentRecurrenceKind, Person, Project, Task, TaskListScope, TaskPriority } from "../types";
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
  formatAppointmentParticipants,
  formatAppointmentTimeRange,
  isAppointmentRelevantToPerson,
  isAppointmentScheduled,
} from "../utils/appointments";
import { ParticipantMultiSelect } from "./ParticipantMultiSelect";
import { ConfirmPanel } from "./TaskWorkerActions";
import {
  datetimeLocalToIso,
  defaultOrgDatetimeLocal,
  formatInOrgTime,
  orgDateKey,
  orgTodayDateKey,
  toDatetimeLocalValue,
} from "../utils/orgTimezone";
import { syncCrmItemToGoogleCalendar } from "../firebase/googleCalendar";
import { normalizeAppointmentParticipants } from "../utils/appointmentParticipants";
import {
  DEFAULT_RECURRENCE_COUNT,
  MAX_RECURRENCE_COUNT,
  MIN_RECURRENCE_COUNT,
  normalizeRecurrenceCount,
  normalizeRecurrenceDayOfMonth,
  normalizeRecurrenceInterval,
  formatRecurrenceSummary,
  type AppointmentRecurrenceRule,
} from "../utils/appointmentRecurrence";
import {
  appointmentMatchesListTab,
  appointmentStartsAtMsForList,
  appointmentsForListView,
  isRecurringAppointment,
  listDisplayOccurrence,
} from "../utils/appointmentDisplay";
import { useT } from "../contexts/I18nContext";

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
  recurring: boolean;
  recurrenceKind: AppointmentRecurrenceKind;
  recurrenceInterval: number;
  recurrenceDayOfMonth: number;
  recurrenceCount: number;
};

function isRecurrenceDraftDefault(draft: AppointmentDraft): boolean {
  return (
    !draft.recurring &&
    draft.recurrenceKind === "weekly" &&
    draft.recurrenceInterval === 1 &&
    draft.recurrenceDayOfMonth === 1 &&
    draft.recurrenceCount === DEFAULT_RECURRENCE_COUNT
  );
}

function isAppointmentDraftEmpty(draft: AppointmentDraft): boolean {
  if (draft.linkedTaskIds.length > 0 || draft.newTasks.length > 0) return false;
  if (draft.reviewItems.some((x) => x.trim())) return false;
  if (!isRecurrenceDraftDefault(draft)) return false;
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
    recurring: false,
    recurrenceKind: "weekly",
    recurrenceInterval: 1,
    recurrenceDayOfMonth: 1,
    recurrenceCount: DEFAULT_RECURRENCE_COUNT,
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
  const t = useT();
  return (
    <div className="sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{t("appointments.whatToReview")}</p>
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Plus className="h-3 w-3" aria-hidden />
          {t("appointments.addItem")}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-slate-500">{t("appointments.reviewHint")}</p>
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
                placeholder={t("appointments.reviewPlaceholder")}
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={t("appointments.removeItemAria", { n: String(index + 1) })}
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
  const tr = useT();
  const options = useMemo(() => {
    const aptId = appointmentId?.trim();
    const today = orgTodayDateKey();
    return tasks
      .filter(
        (task) =>
          (isTaskLinkableForAppointment(task, today, aptId) || selectedIds.includes(task.id)) &&
          (!task.appointmentId || !aptId || task.appointmentId === aptId || selectedIds.includes(task.id))
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, appointmentId, selectedIds]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  if (options.length === 0) {
    return <p className="text-[11px] text-slate-500">{tr("appointments.noTasksToLink")}</p>;
  }

  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5">
      {options.map((task) => {
        const checked = selectedIds.includes(task.id);
        return (
          <li key={task.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(task.id)}
                className="rounded border-slate-300 text-accent focus:ring-accent/30"
              />
              <span className="min-w-0 truncate text-sm text-slate-800">{task.title || tr("common.untitledTask")}</span>
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
  onRemoveAppointment,
  onCreateTask,
  onSendTaskCreatedNotifications,
  onUpdateTask,
  onRemoveTask,
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
  onRemoveAppointment: (id: string) => Promise<void>;
  onCreateTask: (
    payload: Omit<Task, "id" | "createdAt">,
    options?: { skipCalendarSync?: boolean; skipNotifications?: boolean; skipStats?: boolean }
  ) => Promise<string>;
  onSendTaskCreatedNotifications: (taskIds: string[], actorId: string) => Promise<void>;
  onRemoveTask: (id: string) => Promise<void>;
  onUpdateTask: (
    id: string,
    patch: Partial<Task>,
    options?: { skipCalendarSync?: boolean }
  ) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  focusAppointmentId?: string | null;
  onFocusAppointmentHandled?: () => void;
}) {
  const t = useT();
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
  const [cancelConfirmId, setCancelConfirmId] = useState("");
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

  const listAppointments = useMemo(
    () => appointmentsForListView(appointments),
    [appointments]
  );

  const scoped = useMemo(() => {
    const base =
      scope === "my" && currentUserId && seesAllOrgData
        ? listAppointments.filter((a) => isAppointmentRelevantToPerson(a, currentUserId, people))
        : listAppointments;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => {
      const blob =
        `${a.title} ${reviewItemsForSearch(a.reviewItems)} ${taskUpdatesToPlainText(sanitizeTaskUpdates(a.description ?? ""))} ${a.location} ${a.meetingLink}`.toLowerCase();
      return blob.includes(q);
    });
  }, [listAppointments, scope, seesAllOrgData, currentUserId, people, query]);

  const filtered = useMemo(() => {
    return scoped.filter((a) => appointmentMatchesListTab(a, listTab, nowMs));
  }, [scoped, listTab, nowMs]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const ta = appointmentStartsAtMsForList(a, nowMs);
      const tb = appointmentStartsAtMsForList(b, nowMs);
      return listTab === "past" || listTab === "canceled" ? tb - ta : ta - tb;
    });
    return list;
  }, [filtered, listTab, nowMs]);

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
    else if (appointmentStartsAtMsForList(apt, nowMs) < nowMs - 60 * 60 * 1000) setListTab("past");
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
      recurring: false,
      recurrenceKind: "weekly",
      recurrenceInterval: 1,
      recurrenceDayOfMonth: 1,
      recurrenceCount: DEFAULT_RECURRENCE_COUNT,
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
      setError(t("appointments.error.titleRequired"));
      return;
    }
    if (!draft.startsAt) {
      setError(t("appointments.error.startRequired"));
      return;
    }
    const startsAt = datetimeLocalToIso(draft.startsAt);
    let endsAt: string | undefined;
    if (draft.endsAt) {
      endsAt = datetimeLocalToIso(draft.endsAt);
      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        setError(t("appointments.error.endAfterStart"));
        return;
      }
    }
    if (descriptionImagesUploading) {
      setError(t("appointments.error.waitUpload"));
      return;
    }
    setBusy(true);
    setError(null);

    const createdTaskIds: string[] = [];
    let createdAppointmentIds: string[] = [];

    async function rollbackCreate() {
      const canHardDelete = seesAllOrgData;
      for (const taskId of createdTaskIds) {
        try {
          if (canHardDelete) {
            await onRemoveTask(taskId);
          } else {
            await onUpdateTask(
              taskId,
              {
                status: "canceled",
                canceledAt: new Date().toISOString(),
                canceledById: currentUserId,
              },
              { skipCalendarSync: true }
            );
          }
        } catch {
          /* best-effort */
        }
      }
      const aptIds = createdAppointmentIds;
      for (const id of aptIds) {
        try {
          if (canHardDelete) {
            await onRemoveAppointment(id);
          } else {
            await onCancelAppointment(id);
          }
        } catch {
          /* best-effort */
        }
      }
    }

    try {
      const participants = normalizeAppointmentParticipants(
        people,
        draft.participantIds,
        draft.participantDepartmentIds
      );
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
        participantIds: participants.participantIds,
        participantDepartmentIds: participants.participantDepartmentIds,
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
      const syncOpts = {
        skipCalendarSync: true as const,
        skipNotifications: true as const,
        skipStats: true as const,
      };

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
        // Create new tasks before appointments so a late failure does not leave a full series behind.
        for (const taskDraft of taskDrafts) {
          const assignees = normalizeAppointmentParticipants(
            people,
            taskDraft.assigneeIds,
            taskDraft.assigneeDepartmentIds
          );
          const payload: Omit<Task, "id" | "createdAt"> = {
            title: taskDraft.title,
            description: "",
            assigneeIds: assignees.participantIds,
            assigneeDepartmentIds: assignees.participantDepartmentIds,
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
          };
          const pid = taskDraft.projectId.trim();
          if (pid) payload.projectId = pid;
          const newId = await onCreateTask(payload, syncOpts);
          createdTaskIds.push(newId);
          desiredLinked.push(newId);
        }

        // See src/utils/appointmentCreateFlow.ts — partner rollback may leave canceled docs.

        const basePayload = {
          ...fields,
          linkedTaskIds: [...new Set(desiredLinked.filter(Boolean))],
          createdById: currentUserId,
        };

        let recurrenceRule: AppointmentRecurrenceRule | undefined;
        let recurrenceCount: number | undefined;
        if (draft.recurring) {
          recurrenceRule = {
            kind: draft.recurrenceKind,
            interval: normalizeRecurrenceInterval(draft.recurrenceInterval),
            ...(draft.recurrenceKind === "monthly_day"
              ? { dayOfMonth: normalizeRecurrenceDayOfMonth(draft.recurrenceDayOfMonth) }
              : {}),
          };
          recurrenceCount = normalizeRecurrenceCount(draft.recurrenceCount);
        }

        appointmentId = await onCreateAppointment(
          {
            ...basePayload,
            ...(recurrenceRule && recurrenceCount ? { recurrenceRule, recurrenceCount } : {}),
          },
          newAppointmentDraftId,
          syncOpts
        );
        createdAppointmentIds = [appointmentId];
        descriptionAtEditStartRef.current = description;
        setShowForm(false);
        setSelectedId(appointmentId);
        setNewAppointmentDraftId(newAppointmentDocId());
      }

      for (const taskId of desiredLinked) {
        const task = allTasks.find((t) => t.id === taskId);
        if (task && task.appointmentId !== appointmentId) {
          await onUpdateTask(taskId, { appointmentId }, syncOpts);
        } else if (createdTaskIds.includes(taskId)) {
          await onUpdateTask(taskId, { appointmentId }, syncOpts);
        }
      }
      for (const taskId of previousLinked) {
        if (!desiredLinked.includes(taskId)) {
          await onUpdateTask(taskId, { appointmentId: "" }, syncOpts);
        }
      }

      if (appointmentId) {
        void syncCrmItemToGoogleCalendar("appointment", appointmentId);
      }
      for (const taskId of desiredLinked) {
        void syncCrmItemToGoogleCalendar("task", taskId);
      }
      if (createdTaskIds.length > 0) {
        await onSendTaskCreatedNotifications(createdTaskIds, currentUserId);
      }
      clearFormDraft(APPOINTMENTS_DRAFT_KEY);
      setDraft(emptyDraft(currentUserId));
    } catch (err) {
      if (!editing) {
        await rollbackCreate();
      }
      setError(err instanceof Error ? err.message : t("appointments.error.save"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string) {
    setBusy(true);
    try {
      await onCancelAppointment(id);
      setSelectedId("");
      setCancelConfirmId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("appointments.error.cancel"));
    } finally {
      setBusy(false);
    }
  }

  const upcomingCount = scoped.filter((a) => appointmentMatchesListTab(a, "upcoming", nowMs)).length;

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
              {t("common.back")}
            </button>
          </div>
          <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <h2 className="font-display text-base font-semibold text-slate-900">
            {editing ? t("appointments.edit") : t("appointments.new")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t("appointments.subtitle")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              {t("common.title")}
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="input-base mt-1 w-full"
                placeholder={t("appointments.titlePlaceholder")}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {t("appointments.starts")}
              <input
                type="datetime-local"
                required
                value={draft.startsAt}
                onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                className="input-base mt-1 w-full"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {t("appointments.ends")} <span className="font-normal text-slate-400">{t("common.optional")}</span>
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                className="input-base mt-1 w-full"
              />
            </label>

            {!editing && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={draft.recurring}
                    onChange={(e) => setDraft((d) => ({ ...d, recurring: e.target.checked }))}
                    className="rounded border-slate-300 text-accent focus:ring-accent/30"
                  />
                  {t("appointments.recurring")}
                </label>

                {draft.recurring && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                      {t("appointments.frequency")}
                      <select
                        value={draft.recurrenceKind}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            recurrenceKind: e.target.value as AppointmentRecurrenceKind,
                          }))
                        }
                        className="input-base mt-1 w-full py-1.5"
                      >
                        <option value="daily">{t("appointments.freq.daily")}</option>
                        <option value="weekly">{t("appointments.freq.weekly")}</option>
                        <option value="monthly">{t("appointments.freq.monthly")}</option>
                        <option value="monthly_day">{t("appointments.freq.monthlyDay")}</option>
                      </select>
                    </label>

                    <label className="block text-xs font-medium text-slate-600">
                      {draft.recurrenceKind === "daily"
                        ? t("appointments.everyDays")
                        : draft.recurrenceKind === "weekly"
                          ? t("appointments.everyWeeks")
                          : t("appointments.everyMonths")}
                      <input
                        type="number"
                        min={1}
                        max={52}
                        value={draft.recurrenceInterval}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            recurrenceInterval: normalizeRecurrenceInterval(e.target.value),
                          }))
                        }
                        className="input-base mt-1 w-full py-1.5"
                      />
                    </label>

                    {draft.recurrenceKind === "monthly_day" && (
                      <label className="block text-xs font-medium text-slate-600">
                        {t("appointments.dayOfMonth")}
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={draft.recurrenceDayOfMonth}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              recurrenceDayOfMonth: normalizeRecurrenceDayOfMonth(e.target.value),
                            }))
                          }
                          className="input-base mt-1 w-full py-1.5"
                        />
                      </label>
                    )}

                    <label className="block text-xs font-medium text-slate-600">
                      {t("appointments.meetingCount")}
                      <input
                        type="number"
                        min={MIN_RECURRENCE_COUNT}
                        max={MAX_RECURRENCE_COUNT}
                        value={draft.recurrenceCount}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            recurrenceCount: normalizeRecurrenceCount(e.target.value),
                          }))
                        }
                        className="input-base mt-1 w-full py-1.5"
                      />
                    </label>

                    <p className="text-[11px] text-slate-500 sm:col-span-2">
                      {formatRecurrenceSummary(
                        {
                          kind: draft.recurrenceKind,
                          interval: normalizeRecurrenceInterval(draft.recurrenceInterval),
                          ...(draft.recurrenceKind === "monthly_day"
                            ? {
                                dayOfMonth: normalizeRecurrenceDayOfMonth(draft.recurrenceDayOfMonth),
                              }
                            : {}),
                        },
                        normalizeRecurrenceCount(draft.recurrenceCount)
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}

            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              {t("appointments.participants")}
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
              {t("appointments.location")}
              <input
                value={draft.location}
                onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                className="input-base mt-1 w-full"
                placeholder={t("appointments.locationPlaceholder")}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              {t("appointments.meetingLink")}{" "}
              <span className="font-normal text-slate-400">{t("common.optional")}</span>
              <input
                type="text"
                value={draft.meetingLink}
                onChange={(e) => setDraft((d) => ({ ...d, meetingLink: e.target.value }))}
                className="input-base mt-1 w-full"
                placeholder={t("appointments.meetingLinkPlaceholder")}
              />
            </label>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-slate-600">
                {t("common.description")} <span className="font-normal text-slate-400">{t("common.optional")}</span>
              </p>
              <div className="mt-1">
                <SimpleRichText
                  value={draft.description}
                  onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
                  placeholder={t("appointments.descriptionPlaceholder")}
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
              <p className="text-xs font-semibold text-slate-800">{t("appointments.tasksSection")}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{t("appointments.tasksSectionHint")}</p>

              <div className="mt-3">
                <p className="text-[11px] font-semibold text-slate-700">{t("appointments.linkExisting")}</p>
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
                  <p className="text-[11px] font-semibold text-slate-700">{t("appointments.createNewTasks")}</p>
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
                    {t("tasks.form.newTask")}
                  </button>
                </div>

              {draft.newTasks.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-500">{t("appointments.noNewTasks")}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {draft.newTasks.map((taskDraft, index) => (
                    <li
                      key={taskDraft.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {t("appointments.taskN", { n: String(index + 1) })}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              newTasks: d.newTasks.filter((task) => task.id !== taskDraft.id),
                            }))
                          }
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={t("appointments.removeTaskAria", { n: String(index + 1) })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                          {t("common.title")}
                          <input
                            value={taskDraft.title}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((task) =>
                                  task.id === taskDraft.id ? { ...task, title: e.target.value } : task
                                ),
                              }))
                            }
                            className="input-base mt-1 w-full py-1.5"
                            placeholder={t("appointments.taskTitlePlaceholder")}
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-600">
                          {t("common.due")}
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
                          {t("tasks.form.priority")}
                          <select
                            value={taskDraft.priority}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((task) =>
                                  task.id === taskDraft.id
                                    ? { ...task, priority: e.target.value as TaskPriority }
                                    : task
                                ),
                              }))
                            }
                            className="input-base mt-1 w-full py-1.5"
                          >
                            <option value="low">{t("tasks.priority.low")}</option>
                            <option value="medium">{t("tasks.priority.medium")}</option>
                            <option value="high">{t("tasks.priority.high")}</option>
                            <option value="urgent">{t("tasks.priority.urgent")}</option>
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                          {t("tasks.form.project")}{" "}
                          <span className="font-normal text-slate-400">{t("common.optional")}</span>
                          <select
                            value={taskDraft.projectId}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((task) =>
                                  task.id === taskDraft.id ? { ...task, projectId: e.target.value } : task
                                ),
                              }))
                            }
                            className="input-base mt-1 w-full py-1.5"
                          >
                            <option value="">{t("tasks.form.noProject")}</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="sm:col-span-2">
                          <span className="mb-1 block text-xs font-medium text-slate-600">{t("appointments.assignTo")}</span>
                          <ParticipantMultiSelect
                            people={people}
                            participantIds={taskDraft.assigneeIds}
                            participantDepartmentIds={taskDraft.assigneeDepartmentIds}
                            currentUserId={currentUserId}
                            onChange={(assigneeIds, assigneeDepartmentIds) =>
                              setDraft((d) => ({
                                ...d,
                                newTasks: d.newTasks.map((task) =>
                                  task.id === taskDraft.id
                                    ? { ...task, assigneeIds, assigneeDepartmentIds }
                                    : task
                                ),
                              }))
                            }
                            placeholder={t("appointments.assigneesPlaceholder")}
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
              {busy ? t("common.saving") : editing ? t("appointments.saveChanges") : t("appointments.create")}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("common.cancel")}
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
                {t("appointments.scope.my")}
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
                {t("common.everyone")}
              </button>
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-600">{t("appointments.scope.my")}</span>
          )}
          <span className="text-xs text-slate-500">
            {t("appointments.upcomingCount", { count: String(upcomingCount) })}
          </span>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600"
        >
          {t("appointments.new")}
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_min(100%,360px)] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-inner">
              {(["upcoming", "past", "canceled"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setListTab(tab)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize sm:text-sm ${
                    listTab === tab ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600"
                  }`}
                >
                  {t(`appointments.tab.${tab}`)}
                </button>
              ))}
            </span>
            <input
              type="search"
              placeholder={t("appointments.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input-base w-full max-w-xs py-1.5 text-sm"
            />
          </div>

          {sorted.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
              {t("appointments.empty", { tab: t(`appointments.tab.${listTab}`) })}
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((apt) => {
                const isSelected = apt.id === selectedId;
                const scheduled = isAppointmentScheduled(apt) && !apt.recurrenceCanceledFrom;
                const displayOcc = listDisplayOccurrence(apt, nowMs);
                const start = new Date(displayOcc.startsAt);
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
                          <div className="font-medium text-slate-900">
                            {apt.title || t("common.untitled")}
                            {isRecurringAppointment(apt) && (
                              <span className="ml-2 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                {t("appointments.recurringBadge")}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-600">
                            {dateLabel}
                            {formatAppointmentTimeRange({
                              ...apt,
                              startsAt: displayOcc.startsAt,
                              endsAt: displayOcc.endsAt,
                            })
                              ? ` · ${formatAppointmentTimeRange({
                                  ...apt,
                                  startsAt: displayOcc.startsAt,
                                  endsAt: displayOcc.endsAt,
                                })}`
                              : ""}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {formatAppointmentParticipants(apt, people, currentUserId)}
                          </div>
                        </div>
                        {!scheduled && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            {t("common.canceled")}
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
                {selected.recurrenceRule && (
                  <p className="mt-1 text-xs text-indigo-700">
                    {formatRecurrenceSummary(selected.recurrenceRule, selected.recurrenceCount)}
                  </p>
                )}
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t("appointments.participants")}</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {formatAppointmentParticipants(selected, people, currentUserId)}
                  </dd>
                </div>
                {(selected.reviewItems?.length ?? 0) > 0 && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {t("appointments.whatToReview")}
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
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t("common.task")}</dt>
                      <dd className="mt-1 space-y-1">
                        {linked.map((task) => (
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
                  );
                })()}
                {selected.createdById && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t("appointments.createdBy")}</dt>
                    <dd className="mt-0.5 text-slate-800">
                      {people.find((p) => p.id === selected.createdById)?.name ?? "—"}
                    </dd>
                  </div>
                )}
                {selected.location && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t("appointments.location")}</dt>
                    <dd className="mt-0.5 text-slate-800">{selected.location}</dd>
                  </div>
                )}
                {selected.meetingLink && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t("appointments.meetingLink")}</dt>
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
                      {t("common.description")}
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
                    {t("common.edit")}
                  </button>
                  {cancelConfirmId === selected.id ? (
                    <div className="w-full">
                      <ConfirmPanel
                        message={t("appointments.cancelConfirm")}
                        yesLabel={t("appointments.yesCancel")}
                        noLabel={t("appointments.keepScheduled")}
                        yesEmphasis
                        onYes={() => void handleCancel(selected.id)}
                        onNo={() => setCancelConfirmId("")}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setCancelConfirmId(selected.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                    >
                      {t("appointments.cancelAppointment")}
                    </button>
                  )}
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
