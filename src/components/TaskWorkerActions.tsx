import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { NotificationKind, Person, Task } from "../types";
import type { TaskUpdateIntent } from "../utils/personTaskStats";
import { NotifyRecipientPicker } from "./NotifyRecipientPicker";
import { getTaskWorkerIds, submitWorkerFinished, taskHasMultipleWorkers } from "../utils/taskAssignees";
import { createFeedbackRequest, personHasOpenFeedbackRequest, personOwesOpenFeedbackReply } from "../utils/taskFeedback";
import { recipientIdsFromSelection, everyoneElsePersonIds } from "../utils/notifyRecipients";
import { useT } from "../contexts/I18nContext";

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
  const t = useT();
  return (
    <div className="confirm-panel">
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
          className="btn-secondary"
        >
          {noLabel ?? t("common.no")}
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
  const t = useT();
  const hideNeedFeedback =
    personHasOpenFeedbackRequest(task, currentUserId) || personOwesOpenFeedbackReply(task, currentUserId);
  const weFinished = taskHasMultipleWorkers(task, people);
  return (
    <>
      <button
        type="button"
        onClick={onFinish}
        className="task-action-finish"
      >
        {weFinished ? t("tasks.worker.weFinished") : t("tasks.worker.iFinished")}
      </button>
      {!hideNeedFeedback && (
        <button
          type="button"
          onClick={onFeedback}
          className="task-action-feedback"
        >
          {t("tasks.worker.needFeedback")}
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
  const t = useT();
  const [notifyPersonIds, setNotifyPersonIds] = useState<string[]>([]);
  const [notifyDeptIds, setNotifyDeptIds] = useState<string[]>([]);
  const [postponeDate, setPostponeDate] = useState(task.dueDate);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const actorName = people.find((p) => p.id === currentUserId)?.name ?? t("common.someone");
  const taskTitle = task.title.trim() || t("common.task");

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
      setSubmitError(t("tasks.worker.pickRecipient"));
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
        t("tasks.worker.notifyFeedback", { actor: actorName, title: taskTitle })
      );
      onClose();
    } catch (e) {
      console.error("submitFeedback", e);
      setSubmitError(t("tasks.worker.feedbackSaveFailed"));
    }
  }

  async function confirmFinish() {
    try {
      await onChange(submitWorkerFinished(task, currentUserId, people));
      const recipients = everyoneElsePersonIds(people, currentUserId);
      await onNotify(
        recipients,
        "task_finished",
        t("tasks.worker.notifyFinished", { actor: actorName, title: taskTitle })
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
        t("tasks.worker.notifyPostponed", { actor: actorName, title: taskTitle, date: formatDue(postponeDate) })
      );
    } catch (e) {
      console.error("confirmPostpone", e);
    }
    onClose();
  }

  if (flow === "feedback") {
    return (
      <div className="mt-2 w-full rounded-lg border border-orange-200 bg-orange-50/50 p-3">
        <p className="text-xs font-medium text-orange-950">{t("tasks.worker.whoNotify")}</p>
        <p className="mt-0.5 text-[11px] text-amber-900/80">{t("tasks.worker.whoNotifyHint")}</p>
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
            {t("tasks.worker.requestFeedback")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            {t("common.cancel")}
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
            weFinished ? t("tasks.worker.finishConfirmAll") : t("tasks.worker.finishConfirmSolo")
          }
          yesLabel={t("tasks.worker.yesSubmit")}
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
        message={t("tasks.worker.postponeMessage")}
        yesLabel={t("tasks.worker.yesFine")}
        onYes={() => void confirmPostpone()}
        onNo={onClose}
      >
        <label className="mt-2 block text-xs text-slate-600">
          {t("tasks.worker.newDueDate")}
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
