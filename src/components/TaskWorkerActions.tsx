import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { NotificationKind, Person, Task } from "../types";
import type { TaskUpdateIntent } from "../utils/personTaskStats";
import { NotifyRecipientPicker } from "./NotifyRecipientPicker";
import { getTaskWorkerIds, submitWorkerFinished, taskHasMultipleWorkers } from "../utils/taskAssignees";
import { createFeedbackRequest, personHasOpenFeedbackRequest, personOwesOpenFeedbackReply } from "../utils/taskFeedback";
import { recipientIdsFromSelection, everyoneElsePersonIds } from "../utils/notifyRecipients";

export type WorkerFlow = "feedback" | "finish" | "postpone" | null;

/** People already on the task — not valid feedback targets. */
function taskInvolvedPersonIds(task: Task, people: Person[]): string[] {
  const ids = new Set(getTaskWorkerIds(task, people));
  if (task.assignedById) ids.add(task.assignedById);
  return [...ids];
}

export function ConfirmPanel({
  message,
  yesLabel,
  noLabel,
  onYes,
  onNo,
  children,
  yesEmphasis = false,
}: {
  message: string;
  yesLabel: string;
  noLabel?: string;
  onYes: () => void;
  onNo: () => void;
  children?: ReactNode;
  yesEmphasis?: boolean;
}) {
  return (
    <div className="w-full rounded-lg border border-slate-200 bg-slate-50/90 p-3 text-left shadow-sm">
      <p className="text-xs leading-relaxed text-slate-800">{message}</p>
      {children}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onYes}
          className={
            yesEmphasis
              ? "rounded-lg border border-emerald-700/40 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
              : "rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
          }
        >
          {yesLabel}
        </button>
        <button
          type="button"
          onClick={onNo}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {noLabel ?? "No"}
        </button>
      </div>
    </div>
  );
}

export function TaskWorkerActionButtons({
  task,
  people,
  currentUserId,
  onFinish,
  onFeedback,
}: {
  task: Task;
  people: Person[];
  currentUserId: string;
  onFinish: () => void;
  onFeedback: () => void;
}) {
  const hideNeedFeedback =
    personHasOpenFeedbackRequest(task, currentUserId) || personOwesOpenFeedbackReply(task, currentUserId);
  const weFinished = taskHasMultipleWorkers(task, people);
  return (
    <>
      <button
        type="button"
        onClick={onFinish}
        className="rounded-lg border border-emerald-400/70 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-950 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
      >
        {weFinished ? "We finished" : "I finished"}
      </button>
      {!hideNeedFeedback && (
        <button
          type="button"
          onClick={onFeedback}
          className="rounded-lg border border-orange-200/90 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900 ring-1 ring-orange-200/80 ring-inset hover:bg-orange-100"
        >
          I need feedback
        </button>
      )}
    </>
  );
}

export function TaskWorkerFlowPanel({
  task,
  people,
  currentUserId,
  flow,
  onClose,
  onChange,
  onNotify,
  formatDue,
  addDaysToDateOnly,
}: {
  task: Task;
  people: Person[];
  currentUserId: string;
  flow: Exclude<WorkerFlow, null>;
  onClose: () => void;
  onChange: (patch: Partial<Task>, intent?: TaskUpdateIntent) => void | Promise<void>;
  onNotify: (
    recipientIds: string[],
    kind: Extract<NotificationKind, "task_feedback" | "task_finished" | "task_postponed">,
    preview: string
  ) => void | Promise<void>;
  formatDue: (iso: string) => string;
  addDaysToDateOnly: (iso: string, days: number) => string;
}) {
  const [notifyPersonIds, setNotifyPersonIds] = useState<string[]>([]);
  const [notifyDeptIds, setNotifyDeptIds] = useState<string[]>([]);
  const [postponeDate, setPostponeDate] = useState(task.dueDate);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const actorName = people.find((p) => p.id === currentUserId)?.name ?? "Someone";

  const feedbackExcludeIds = useMemo(
    () => taskInvolvedPersonIds(task, people),
    [task, people]
  );

  const weFinished = taskHasMultipleWorkers(task, people);

  useEffect(() => {
    if (flow === "postpone") setPostponeDate(addDaysToDateOnly(task.dueDate, 7));
    if (flow === "feedback") {
      setNotifyPersonIds([]);
      setNotifyDeptIds([]);
    }
  }, [flow, task.dueDate, addDaysToDateOnly]);

  async function submitFeedback() {
    setSubmitError(null);
    const recipients = recipientIdsFromSelection(people, notifyPersonIds, notifyDeptIds, [
      currentUserId,
      ...feedbackExcludeIds,
    ]);
    if (recipients.length === 0) {
      setSubmitError("Pick at least one person or sector to notify.");
      return;
    }
    try {
      await onChange(
        createFeedbackRequest(task, people, currentUserId, notifyPersonIds, notifyDeptIds),
        "feedback_request"
      );
      await onNotify(
        recipients,
        "task_feedback",
        `${actorName} requested feedback on “${task.title.trim() || "a task"}”.`
      );
      onClose();
    } catch (e) {
      console.error("submitFeedback", e);
      setSubmitError("Could not save the feedback request. Try again.");
    }
  }

  async function confirmFinish() {
    try {
      await onChange(submitWorkerFinished(task, currentUserId, people));
      const recipients = everyoneElsePersonIds(people, currentUserId);
      await onNotify(
        recipients,
        "task_finished",
        `${actorName} marked their work finished on “${task.title.trim() || "a task"}”.`
      );
    } catch (e) {
      console.error("confirmFinish", e);
    }
    onClose();
  }

  async function confirmPostpone() {
    try {
      await onChange({ dueDate: postponeDate, postponeCount: task.postponeCount + 1 }, "postpone");
      const recipients = everyoneElsePersonIds(people, currentUserId);
      await onNotify(
        recipients,
        "task_postponed",
        `${actorName} postponed “${task.title.trim() || "a task"}” to ${formatDue(postponeDate)}.`
      );
    } catch (e) {
      console.error("confirmPostpone", e);
    }
    onClose();
  }

  if (flow === "feedback") {
    return (
      <div className="mt-2 w-full rounded-lg border border-orange-200 bg-orange-50/50 p-3">
        <p className="text-xs font-medium text-orange-950">Who should be notified?</p>
        <p className="mt-0.5 text-[11px] text-amber-900/80">
          Pick people or sectors outside this task. Anyone already assigned is not listed.
        </p>
        <div className="mt-2">
          <NotifyRecipientPicker
            people={people}
            personIds={notifyPersonIds}
            departmentIds={notifyDeptIds}
            onChange={(p, d) => {
              setNotifyPersonIds(p);
              setNotifyDeptIds(d);
            }}
            excludePersonId={currentUserId}
            excludePersonIds={feedbackExcludeIds}
          />
        </div>
        {submitError && <p className="mt-2 text-xs font-medium text-rose-700">{submitError}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              recipientIdsFromSelection(people, notifyPersonIds, notifyDeptIds, [
                currentUserId,
                ...feedbackExcludeIds,
              ]).length === 0
            }
            onClick={() => void submitFeedback()}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Request feedback
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (flow === "finish") {
    return (
      <div className="mt-2 w-full">
        <ConfirmPanel
          message={
            weFinished
              ? "Mark this task complete for everyone assigned? It will move to the Completed tab."
              : "Mark this task complete? It will move to the Completed tab."
          }
          yesLabel="Yes, submit"
          yesEmphasis={true}
          onYes={() => void confirmFinish()}
          onNo={onClose}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 w-full">
      <ConfirmPanel
        message="Postpone the due date to:"
        yesLabel="Yes, it's fine"
          onYes={() => void confirmPostpone()}
        onNo={onClose}
      >
        <label className="mt-2 block text-xs text-slate-600">
          New due date
          <input
            type="date"
            value={postponeDate}
            onChange={(e) => setPostponeDate(e.target.value)}
            className="input-base mt-1 w-full py-1.5 text-sm"
          />
        </label>
      </ConfirmPanel>
    </div>
  );
}
