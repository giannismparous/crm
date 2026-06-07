import type { CommentReactions, ImageAttachment, Task, TaskComment } from "../types";
import { imageAttachmentsForFirestore, normalizeImageAttachments } from "./imageAttachments";

const MAX_BODY = 4000;

function dedupeIds(ids: unknown[]): string[] {
  return [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
}

function normalizeCommentReactions(raw: unknown): CommentReactions | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;

  if (Array.isArray(o.likes) || Array.isArray(o.dislikes)) {
    const likes = Array.isArray(o.likes) ? dedupeIds(o.likes as unknown[]) : [];
    const dislikes = Array.isArray(o.dislikes) ? dedupeIds(o.dislikes as unknown[]) : [];
    if (likes.length === 0 && dislikes.length === 0) return undefined;
    return { likes, dislikes };
  }

  return undefined;
}

export function normalizeTaskComments(value: unknown): TaskComment[] {
  if (!Array.isArray(value)) return [];
  const out: TaskComment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const authorId = typeof row.authorId === "string" ? row.authorId.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim().slice(0, MAX_BODY) : "";
    const createdAt = typeof row.createdAt === "string" ? row.createdAt : "";
    const attachments = normalizeImageAttachments(row.attachments);
    if (!id || !authorId || !createdAt || (!body && attachments.length === 0)) continue;
    const reactions = normalizeCommentReactions(row.reactions);
    out.push({
      id,
      authorId,
      body,
      createdAt,
      ...(reactions ? { reactions } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    });
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

export function taskCommentsPlainText(comments: TaskComment[]): string {
  return comments.map((c) => c.body).join(" ");
}

export function taskCommentsForFirestore(comments: TaskComment[]): Record<string, unknown>[] {
  return comments.map((c) => {
    const row: Record<string, unknown> = {
      id: c.id,
      authorId: c.authorId,
      body: c.body,
      createdAt: c.createdAt,
    };
    if (c.reactions) row.reactions = c.reactions;
    if (c.attachments?.length) row.attachments = imageAttachmentsForFirestore(c.attachments);
    return row;
  });
}

export function appendTaskComment(
  task: Task,
  authorId: string,
  body: string,
  attachments?: ImageAttachment[]
): TaskComment[] {
  const text = body.trim().slice(0, MAX_BODY);
  const imgs = attachments ?? [];
  if (!text && imgs.length === 0) return task.comments;
  const comment: TaskComment = {
    id: crypto.randomUUID(),
    authorId,
    body: text,
    createdAt: new Date().toISOString(),
    ...(imgs.length > 0 ? { attachments: imgs } : {}),
  };
  return [...task.comments, comment];
}

export function removeCommentAttachment(
  task: Task,
  commentId: string,
  storagePath: string
): TaskComment[] | null {
  const path = storagePath.trim();
  if (!path) return null;

  let changed = false;
  const next = task.comments.map((c) => {
    if (c.id !== commentId) return c;
    const attachments = (c.attachments ?? []).filter((a) => a.storagePath !== path);
    if (attachments.length === (c.attachments ?? []).length) return c;
    changed = true;
    if (!c.body.trim() && attachments.length === 0) return c;
    const base = { id: c.id, authorId: c.authorId, body: c.body, createdAt: c.createdAt };
    const row: TaskComment = { ...base, ...(c.reactions ? { reactions: c.reactions } : {}) };
    if (attachments.length > 0) row.attachments = attachments;
    return row;
  });

  return changed ? next : null;
}

export type CommentVoteApplyResult = {
  comments: TaskComment[];
  /** Set when a new like/dislike was added (not when removed) — use for notifications. */
  addedVote: "like" | "dislike" | null;
  /** Current user removed their vote entirely (toggle off). */
  clearedVote: boolean;
};

/** Like/dislike are mutually exclusive per person. Tapping the active vote removes it. */
export function applyCommentVote(
  task: Task,
  commentId: string,
  personId: string,
  vote: "like" | "dislike"
): CommentVoteApplyResult | null {
  const comment = task.comments.find((c) => c.id === commentId);
  if (!comment || !personId) return null;

  const prev = comment.reactions ?? { likes: [], dislikes: [] };
  const hadVote = prev.likes.includes(personId) || prev.dislikes.includes(personId);
  let likes = [...(prev.likes ?? [])];
  let dislikes = [...(prev.dislikes ?? [])];
  let addedVote: "like" | "dislike" | null = null;

  if (vote === "like") {
    if (likes.includes(personId)) {
      likes = likes.filter((id) => id !== personId);
    } else {
      likes.push(personId);
      dislikes = dislikes.filter((id) => id !== personId);
      addedVote = "like";
    }
  } else {
    if (dislikes.includes(personId)) {
      dislikes = dislikes.filter((id) => id !== personId);
    } else {
      dislikes.push(personId);
      likes = likes.filter((id) => id !== personId);
      addedVote = "dislike";
    }
  }

  const nextComments = task.comments.map((c) => {
    if (c.id !== commentId) return c;
    const r: CommentReactions = { likes, dislikes };
    if (r.likes.length === 0 && r.dislikes.length === 0) {
      const { reactions: _r, ...rest } = c;
      return rest as TaskComment;
    }
    return { ...c, reactions: r };
  });

  const updated = nextComments.find((c) => c.id === commentId)!;
  const nextL = updated.reactions?.likes ?? [];
  const nextD = updated.reactions?.dislikes ?? [];
  const hasVote = nextL.includes(personId) || nextD.includes(personId);
  const clearedVote = hadVote && !hasVote;

  return { comments: nextComments, addedVote, clearedVote };
}
