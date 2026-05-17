import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import type {
  CommentReactionNotifyChange,
  Person,
  Task,
  TaskComment,
  TaskFeedbackRequest,
} from "../types";
import { appendTaskComment, applyCommentVote } from "../utils/taskComments";
import {
  addFeedbackResponse,
  askedPersonNames,
  canReplyToFeedbackRequest,
} from "../utils/taskFeedback";
import { MentionTextarea, renderTextWithMentions } from "./MentionTextarea";

const COMMENTS_PAGE_SIZE = 10;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FeedbackRequestCard({
  request,
  people,
  currentUserId,
  onReply,
}: {
  request: TaskFeedbackRequest;
  people: Person[];
  currentUserId: string;
  onReply: (requestId: string, body: string) => void | Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const requester = people.find((p) => p.id === request.requestedById)?.name ?? "Someone";
  const asked = askedPersonNames(request, people);
  const resolved = request.status === "resolved";
  const canReply = canReplyToFeedbackRequest(request, currentUserId);

  const line = resolved
    ? `Feedback given · from ${requester} · for ${asked || "—"} · ${formatTime(request.createdAt)}`
    : `Feedback requested · from ${requester} · for ${asked || "—"} · ${formatTime(request.createdAt)}`;

  async function sendReply() {
    if (!reply.trim() || posting) return;
    setPosting(true);
    try {
      await onReply(request.id, reply);
      setReply("");
    } finally {
      setPosting(false);
    }
  }

  return (
    <li
      className={`relative isolate z-10 overflow-visible rounded-xl border px-3 py-2.5 shadow-sm ${
        resolved
          ? "border-amber-300/90 bg-gradient-to-br from-amber-50 via-amber-50 to-yellow-50/90"
          : "border-amber-400/80 bg-gradient-to-br from-amber-50 via-yellow-50/80 to-amber-100/50 ring-1 ring-amber-300/60"
      }`}
    >
      <p className="text-[11px] font-medium leading-snug text-amber-950">{line}</p>

      {request.responses.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-t border-amber-300/50 pt-2">
          {request.responses.map((res) => {
            const name = people.find((p) => p.id === res.personId)?.name ?? "Someone";
            return (
              <li
                key={`${res.personId}-${res.createdAt}`}
                className="rounded-lg border border-amber-200/60 bg-white/80 px-2 py-1.5"
              >
                <p className="text-[10px] font-medium text-amber-900">
                  {name}
                  <span className="font-normal text-amber-800/80"> · {formatTime(res.createdAt)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-amber-950">{res.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {canReply && (
        <div className="relative z-30 mt-2 border-t border-amber-300/50 pt-2">
          <p className="mb-1.5 text-[11px] font-medium text-amber-950">Your feedback</p>
          <textarea
            id={`feedback-reply-${request.id}`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Write feedback…"
            className="input-base min-h-[5rem] w-full border-amber-200/80 bg-white py-1.5 text-sm text-slate-900 placeholder:text-slate-400"
            aria-label="Feedback reply"
          />
          <button
            type="button"
            disabled={posting || !reply.trim()}
            onClick={() => void sendReply()}
            className="mt-3 w-full rounded-lg border border-indigo-700/30 bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-accent-dim focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-800 disabled:shadow-none"
          >
            {posting ? "Sending…" : "Submit feedback"}
          </button>
        </div>
      )}
    </li>
  );
}

function CommentItem({
  comment: c,
  people,
  currentUserId,
  onVote,
}: {
  comment: TaskComment;
  people: Person[];
  currentUserId: string;
  onVote: (commentId: string, vote: "like" | "dislike") => void;
}) {
  const name = people.find((p) => p.id === c.authorId)?.name ?? "Unknown";
  const isMe = c.authorId === currentUserId;
  const likes = c.reactions?.likes ?? [];
  const dislikes = c.reactions?.dislikes ?? [];
  const liked = likes.includes(currentUserId);
  const disliked = dislikes.includes(currentUserId);
  const showCompactCounts = likes.length > 1 || dislikes.length > 1;

  return (
    <li className="group relative rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2">
      <div className="pointer-events-auto absolute right-2 top-2 z-[1]">
        <div className="relative flex h-6 min-w-[2rem] items-center justify-end">
          {showCompactCounts && (
            <div
              className="absolute inset-0 flex items-center justify-end gap-1 text-[11px] font-medium tabular-nums text-slate-500 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 [@media(pointer:coarse)]:hidden"
              aria-hidden
            >
              {likes.length > 1 && <span>👍{likes.length}</span>}
              {dislikes.length > 1 && <span>👎{dislikes.length}</span>}
            </div>
          )}
          <div className="flex items-center gap-0.5 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100">
            <button
              type="button"
              title={likes.length ? `${likes.length} like${likes.length === 1 ? "" : "s"}` : "Like"}
              aria-pressed={liked}
              aria-label={liked ? "Remove like" : "Like"}
              onClick={() => onVote(c.id, "like")}
              className={`rounded px-1 py-px text-sm leading-none transition-colors ${
                liked
                  ? "bg-sky-100 text-sky-950 ring-1 ring-sky-400/70"
                  : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
              }`}
            >
              👍
            </button>
            <button
              type="button"
              title={dislikes.length ? `${dislikes.length} dislike${dislikes.length === 1 ? "" : "s"}` : "Dislike"}
              aria-pressed={disliked}
              aria-label={disliked ? "Remove dislike" : "Dislike"}
              onClick={() => onVote(c.id, "dislike")}
              className={`rounded px-1 py-px text-sm leading-none transition-colors ${
                disliked
                  ? "bg-rose-100 text-rose-950 ring-1 ring-rose-400/70"
                  : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
              }`}
            >
              👎
            </button>
          </div>
        </div>
      </div>

      <p className="min-w-0 pr-[4.5rem] text-[11px] font-medium text-slate-600">
        {name}
        {isMe && <span className="font-normal text-slate-400"> · you</span>}
        <span className="font-normal text-slate-400"> · {formatTime(c.createdAt)}</span>
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
        {renderTextWithMentions(c.body, people)}
      </p>
    </li>
  );
}

export function TaskCommentsSection({
  task,
  people,
  currentUserId,
  onChange,
  onCommentPosted,
  onCommentReaction,
  onFeedbackReply,
}: {
  task: Task;
  people: Person[];
  currentUserId: string;
  onChange: (patch: Partial<Task>) => void | Promise<void>;
  onCommentPosted?: (task: Task, comment: TaskComment) => void | Promise<void>;
  onCommentReaction?: (
    task: Task,
    comment: TaskComment,
    change: CommentReactionNotifyChange
  ) => void | Promise<void>;
  onFeedbackReply?: (
    task: Task,
    request: TaskFeedbackRequest,
    body: string,
    updated: Task
  ) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [visibleCommentCount, setVisibleCommentCount] = useState(COMMENTS_PAGE_SIZE);

  const feedbackSorted = [...(task.feedbackRequests ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const totalItems = feedbackSorted.length + task.comments.length;

  useEffect(() => {
    setSectionOpen(false);
    setVisibleCommentCount(COMMENTS_PAGE_SIZE);
  }, [task.id]);

  const visibleComments =
    task.comments.length <= visibleCommentCount
      ? task.comments
      : task.comments.slice(task.comments.length - visibleCommentCount);
  const hiddenOlderCount = task.comments.length - visibleComments.length;
  const olderBatch = Math.min(COMMENTS_PAGE_SIZE, hiddenOlderCount);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (posting || !draft.trim()) return;
    const next = appendTaskComment(task, currentUserId, draft);
    if (next.length === task.comments.length) return;
    const added = next[next.length - 1]!;
    setPosting(true);
    setDraft("");
    try {
      await onChange({ comments: next });
      await onCommentPosted?.({ ...task, comments: next }, added);
      setSectionOpen(true);
      setVisibleCommentCount(COMMENTS_PAGE_SIZE);
    } finally {
      setPosting(false);
    }
  }

  async function handleFeedbackReply(requestId: string, body: string) {
    const request = (task.feedbackRequests ?? []).find((r) => r.id === requestId);
    if (!request) return;
    const patch = addFeedbackResponse(task, requestId, currentUserId, body);
    const updated = { ...task, ...patch };
    await onChange(patch);
    await onFeedbackReply?.(task, request, body, updated);
  }

  async function handleVote(commentId: string, vote: "like" | "dislike") {
    const result = applyCommentVote(task, commentId, currentUserId, vote);
    if (!result) return;
    const { comments, addedVote, clearedVote } = result;
    await onChange({ comments });
    const updatedComment = comments.find((c) => c.id === commentId);
    if (!updatedComment || !onCommentReaction) return;
    const updatedTask = { ...task, comments };
    if (clearedVote) {
      await onCommentReaction(updatedTask, updatedComment, { kind: "cleared" });
    } else if (addedVote) {
      await onCommentReaction(updatedTask, updatedComment, { kind: "added", vote: addedVote });
    }
  }

  return (
    <div className="mt-3 mb-6">
      <button
        type="button"
        onClick={() => setSectionOpen((open) => !open)}
        className="flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-xs font-medium text-slate-600 hover:text-slate-900"
        aria-expanded={sectionOpen}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${sectionOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
        <span>Comments</span>
        {totalItems > 0 && (
          <span className="font-normal tabular-nums text-slate-400">({totalItems})</span>
        )}
      </button>

      {sectionOpen && (
        <div className="mt-2 space-y-3">
          {feedbackSorted.length > 0 && (
            <ul className="space-y-2">
              {feedbackSorted.map((req) => (
                <FeedbackRequestCard
                  key={req.id}
                  request={req}
                  people={people}
                  currentUserId={currentUserId}
                  onReply={handleFeedbackReply}
                />
              ))}
            </ul>
          )}

          {task.comments.length > 0 && (
            <div className="space-y-2">
              {hiddenOlderCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCommentCount((n) =>
                      Math.min(task.comments.length, n + COMMENTS_PAGE_SIZE)
                    )
                  }
                  className="w-full rounded-lg border border-dashed border-slate-200 py-1.5 text-center text-[11px] font-medium text-accent hover:border-accent/40 hover:bg-accent/5"
                >
                  Show {olderBatch} older comment{olderBatch === 1 ? "" : "s"}
                </button>
              )}
              <ul className="space-y-2">
                {visibleComments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    people={people}
                    currentUserId={currentUserId}
                    onVote={(id, vote) => void handleVote(id, vote)}
                  />
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              placeholder="Add a comment… (@ to mention)"
              people={people}
            />
            <button
              type="submit"
              disabled={!draft.trim() || posting}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post comment"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
