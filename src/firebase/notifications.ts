import {
  collection,
  doc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { Person, Task, TaskComment } from "../types";
import type { AppNotification, NotificationKind } from "../types";
import { getTaskWorkerIds } from "../utils/taskAssignees";
import { parseMentionsFromText } from "../utils/mentions";
import { taskFinishedNotifyRecipients } from "../utils/notifyRecipients";

const PREVIEW_LEN = 160;

type RecipientMeta = {
  kind: NotificationKind;
  mentionLabel?: string;
};

function bodyPreview(body: string): string {
  const t = body.trim();
  if (t.length <= PREVIEW_LEN) return t;
  return t.slice(0, PREVIEW_LEN).trimEnd() + "…";
}

const NOTIFICATION_KINDS = new Set<NotificationKind>([
  "task_comment",
  "mention_person",
  "mention_department",
  "task_feedback",
  "task_feedback_reply",
  "task_finished",
  "task_postponed",
  "task_created",
  "task_marked_complete",
  "task_reopened",
  "comment_reaction",
  "reminder_shared",
  "reminder_due",
  "member_joined",
]);

function normalizeKind(raw: unknown): NotificationKind {
  if (typeof raw === "string" && NOTIFICATION_KINDS.has(raw as NotificationKind)) {
    return raw as NotificationKind;
  }
  if (raw === "mention") return "mention_person";
  return "task_comment";
}

export function normalizeNotification(id: string, data: Record<string, unknown>): AppNotification {
  const kind = normalizeKind(data.kind);
  const mentionLabel =
    typeof data.mentionLabel === "string" && data.mentionLabel.trim()
      ? data.mentionLabel.trim()
      : undefined;
  return {
    id: typeof data.id === "string" ? data.id : id,
    recipientId: String(data.recipientId ?? ""),
    kind,
    taskId: String(data.taskId ?? ""),
    taskTitle: String(data.taskTitle ?? ""),
    commentId: String(data.commentId ?? ""),
    authorId: String(data.authorId ?? ""),
    authorName: String(data.authorName ?? ""),
    bodyPreview: String(data.bodyPreview ?? ""),
    mentionLabel,
    read: Boolean(data.read),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
  };
}

/**
 * Who gets notified:
 * - Assignees (people + departments on the task) → task_comment (except author)
 * - @person (not already an assignee) → mention_person
 * - @department members (not already notified as assignee) → mention_department
 * Others are never notified.
 */
function resolveRecipients(
  task: Task,
  comment: TaskComment,
  people: Person[]
): Map<string, RecipientMeta> {
  const authorId = comment.authorId;
  const workers = new Set(getTaskWorkerIds(task, people));
  const recipients = new Map<string, RecipientMeta>();

  for (const workerId of workers) {
    if (workerId && workerId !== authorId) {
      recipients.set(workerId, { kind: "task_comment" });
    }
  }

  for (const mention of parseMentionsFromText(comment.body, people)) {
    if (mention.kind === "person") {
      if (mention.id === authorId) continue;
      if (!recipients.has(mention.id)) {
        recipients.set(mention.id, { kind: "mention_person" });
      }
      continue;
    }
    for (const p of people) {
      if (!p.departments.includes(mention.label) || p.id === authorId) continue;
      if (recipients.has(p.id)) continue;
      recipients.set(p.id, { kind: "mention_department", mentionLabel: mention.label });
    }
  }

  return recipients;
}

/** One notification doc per recipient per comment (`{commentId}_{recipientId}`). */
export async function createNotificationsForComment(
  db: Firestore,
  orgId: string,
  task: Task,
  comment: TaskComment,
  people: Person[]
): Promise<void> {
  const author = people.find((p) => p.id === comment.authorId);
  const authorName = author?.name ?? "Someone";
  const recipients = resolveRecipients(task, comment, people);
  if (recipients.size === 0) return;

  const batch = writeBatch(db);
  const col = collection(db, "organizations", orgId, "notifications");
  const createdAt = comment.createdAt || new Date().toISOString();
  const preview = bodyPreview(comment.body);
  const taskTitle = task.title.trim() || "Untitled task";

  for (const [recipientId, meta] of recipients) {
    const notifId = `${comment.id}_${recipientId}`;
    const ref = doc(col, notifId);
    batch.set(ref, {
      id: notifId,
      recipientId,
      kind: meta.kind,
      mentionLabel: meta.mentionLabel ?? "",
      taskId: task.id,
      taskTitle,
      commentId: comment.id,
      authorId: comment.authorId,
      authorName,
      bodyPreview: preview,
      read: false,
      createdAt,
    });
  }

  await batch.commit();
}

/** Comment author only (not assignees or @mentions). New comments use resolveRecipients instead. */
export function recipientsForCommentReaction(
  comment: TaskComment,
  actorId: string,
  _people: Person[]
): string[] {
  if (comment.authorId && comment.authorId !== actorId) return [comment.authorId];
  return [];
}

/** One doc per (comment, reactor, recipient); supports overwrite on like↔dislike and delete on clear. */
export function commentReactionNotificationId(
  commentId: string,
  actorId: string,
  recipientId: string
): string {
  return `${commentId}_react_${actorId}_${recipientId}`;
}

export async function createNotificationsForCommentReaction(
  db: Firestore,
  orgId: string,
  task: Task,
  comment: TaskComment,
  actorId: string,
  actorName: string,
  reaction: "like" | "dislike",
  people: Person[]
): Promise<void> {
  const recipientIds = recipientsForCommentReaction(comment, actorId, people);
  if (recipientIds.length === 0) return;

  const batch = writeBatch(db);
  const col = collection(db, "organizations", orgId, "notifications");
  const createdAt = new Date().toISOString();
  const taskTitle = task.title.trim() || "Untitled task";
  const verb = reaction === "like" ? "liked" : "disliked";
  const preview = `${actorName} ${verb} a comment`;

  for (const recipientId of recipientIds) {
    const notifId = commentReactionNotificationId(comment.id, actorId, recipientId);
    batch.set(doc(col, notifId), {
      id: notifId,
      recipientId,
      kind: "comment_reaction",
      mentionLabel: reaction,
      taskId: task.id,
      taskTitle,
      commentId: comment.id,
      authorId: actorId,
      authorName: actorName,
      bodyPreview: preview,
      read: false,
      createdAt,
    });
  }

  await batch.commit();
}

export async function deleteNotificationsForCommentReaction(
  db: Firestore,
  orgId: string,
  comment: TaskComment,
  actorId: string,
  people: Person[]
): Promise<void> {
  const recipientIds = recipientsForCommentReaction(comment, actorId, people);
  if (recipientIds.length === 0) return;

  const batch = writeBatch(db);
  const col = collection(db, "organizations", orgId, "notifications");
  for (const recipientId of recipientIds) {
    const notifId = commentReactionNotificationId(comment.id, actorId, recipientId);
    batch.delete(doc(col, notifId));
  }

  await batch.commit();
}

function taskFinishedCopy(actorName: string, taskTitle: string, role: "assigner" | "worker" | "org"): {
  mentionLabel: string;
  bodyPreview: string;
} {
  const title = taskTitle.trim() || "Untitled task";
  if (role === "assigner") {
    return { mentionLabel: "assigner", bodyPreview: "" };
  }
  if (role === "worker") {
    return { mentionLabel: "worker", bodyPreview: "" };
  }
  return {
    mentionLabel: "",
    bodyPreview: `${actorName} marked their work finished on “${title}”.`,
  };
}

/** I finished — assigner / co-workers on the task get tailored headlines; everyone else gets the generic line. */
export async function createNotificationsForTaskFinished(
  db: Firestore,
  orgId: string,
  task: Task,
  actorId: string,
  actorName: string,
  people: Person[]
): Promise<void> {
  const recipients = taskFinishedNotifyRecipients(task, actorId, people);
  if (recipients.length === 0) return;

  const batch = writeBatch(db);
  const col = collection(db, "organizations", orgId, "notifications");
  const createdAt = new Date().toISOString();
  const taskTitle = task.title.trim() || "Untitled task";
  const eventKey = `task_finished_${createdAt}`;

  for (const { recipientId, role } of recipients) {
    const { mentionLabel, bodyPreview } = taskFinishedCopy(actorName, taskTitle, role);
    const notifId = `${task.id}_${eventKey}_${recipientId}`;
    batch.set(doc(col, notifId), {
      id: notifId,
      recipientId,
      kind: "task_finished",
      mentionLabel,
      taskId: task.id,
      taskTitle,
      commentId: eventKey,
      authorId: actorId,
      authorName: actorName,
      bodyPreview,
      read: false,
      createdAt,
    });
  }

  await batch.commit();
}

/** Notify selected people about a task action (feedback, finished, postponed). */
export async function createNotificationsForTaskEvent(
  db: Firestore,
  orgId: string,
  task: Task,
  actorId: string,
  actorName: string,
  recipientIds: string[],
  kind: NotificationKind,
  bodyPreview: string
): Promise<void> {
  const unique = [...new Set(recipientIds.filter((id) => id && id !== actorId))];
  if (unique.length === 0) return;
  if (!NOTIFICATION_KINDS.has(kind)) return;

  const batch = writeBatch(db);
  const col = collection(db, "organizations", orgId, "notifications");
  const createdAt = new Date().toISOString();
  const taskTitle = task.title.trim() || "Untitled task";
  const preview = bodyPreview.trim();
  const eventKey = `${kind}_${createdAt}`;

  for (const recipientId of unique) {
    const notifId = `${task.id}_${eventKey}_${recipientId}`;
    batch.set(doc(col, notifId), {
      id: notifId,
      recipientId,
      kind,
      mentionLabel: "",
      taskId: task.id,
      taskTitle,
      commentId: eventKey,
      authorId: actorId,
      authorName: actorName,
      bodyPreview: preview,
      read: false,
      createdAt,
    });
  }

  await batch.commit();
}

/** Notify people included on a personal reminder (taskId stores reminder id). */
export async function createNotificationsForReminderShared(
  db: Firestore,
  orgId: string,
  reminderId: string,
  reminderTitle: string,
  actorId: string,
  actorName: string,
  recipientIds: string[],
  bodyPreview = ""
): Promise<void> {
  const unique = [...new Set(recipientIds.filter((id) => id && id !== actorId))];
  if (unique.length === 0) return;

  const batch = writeBatch(db);
  const col = collection(db, "organizations", orgId, "notifications");
  const createdAt = new Date().toISOString();
  const title = reminderTitle.trim() || "Reminder";
  const preview = bodyPreview.trim();
  const eventKey = `reminder_shared_${createdAt}`;

  for (const recipientId of unique) {
    const notifId = `${reminderId}_${eventKey}_${recipientId}`;
    batch.set(doc(col, notifId), {
      id: notifId,
      recipientId,
      kind: "reminder_shared",
      mentionLabel: "",
      taskId: reminderId,
      taskTitle: title,
      commentId: eventKey,
      authorId: actorId,
      authorName: actorName,
      bodyPreview: preview,
      read: false,
      createdAt,
    });
  }

  await batch.commit();
}

/** One doc per recipient per reminder (`{reminderId}_due_{recipientId}`); each slot overwrites as a fresh unread alert. */
export async function upsertReminderDueNotifications(
  db: Firestore,
  orgId: string,
  reminderId: string,
  reminderTitle: string,
  recipientIds: string[],
  slotLabel: string,
  slotKey: string
): Promise<void> {
  const unique = [...new Set(recipientIds.filter(Boolean))];
  if (unique.length === 0) return;

  const batch = writeBatch(db);
  const col = collection(db, "organizations", orgId, "notifications");
  const createdAt = new Date().toISOString();
  const title = reminderTitle.trim() || "Reminder";
  const preview = `Due in ${slotLabel}`;

  for (const recipientId of unique) {
    const notifId = `${reminderId}_due_${recipientId}`;
    batch.set(doc(col, notifId), {
      id: notifId,
      recipientId,
      kind: "reminder_due",
      mentionLabel: slotLabel,
      taskId: reminderId,
      taskTitle: title,
      commentId: `due_${slotKey}`,
      authorId: "",
      authorName: "Reminder",
      bodyPreview: preview,
      read: false,
      createdAt,
    });
  }

  await batch.commit();
}

function splitDisplayName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "New", last: "teammate" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

/** Notify the whole team when someone finishes profile setup and joins. */
export async function createNotificationsForNewMember(
  db: Firestore,
  orgId: string,
  memberId: string,
  displayName: string,
  orgRole: string,
  departments: string[],
  people: Person[]
): Promise<void> {
  const recipients = people.filter((p) => p.authUid && p.id !== memberId).map((p) => p.id);
  if (recipients.length === 0) return;

  const { first, last } = splitDisplayName(displayName);
  const fullName = last ? `${first} ${last}` : first;
  const roleLabel = orgRole === "founder" ? "Founder" : "Partner";
  const deptLabel = departments.length > 0 ? departments.join(", ") : "";
  const batch = writeBatch(db);
  const col = collection(db, "organizations", orgId, "notifications");
  const createdAt = new Date().toISOString();
  const eventKey = `joined_${createdAt}`;

  for (const recipientId of recipients) {
    const notifId = `member_joined_${memberId}_${recipientId}`;
    batch.set(doc(col, notifId), {
      id: notifId,
      recipientId,
      kind: "member_joined",
      mentionLabel: roleLabel,
      taskId: memberId,
      taskTitle: fullName,
      commentId: eventKey,
      authorId: memberId,
      authorName: fullName,
      bodyPreview: deptLabel ? `${roleLabel} · ${deptLabel}` : roleLabel,
      read: false,
      createdAt,
    });
  }

  await batch.commit();
}
