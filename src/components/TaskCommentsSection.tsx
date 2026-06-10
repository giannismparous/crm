import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import type {
  CommentReactionNotifyChange,
  ImageAttachment,
  Person,
  Project,
  Task,
  TaskComment,
  TaskFeedbackRequest,
} from "../types";
import {
  departmentsMentionableOnTask,
  peopleMentionableOnTask,
} from "../utils/orgVisibility";
import { appendTaskComment, applyCommentVote } from "../utils/taskComments";
import {
  taskUpdateEntries,
  updateMentionLabels,
  updatePreviewPlain,
} from "../utils/taskUpdates";
import { TASK_UPDATE_EXPAND_EVENT } from "../utils/taskUpdateEntries";
import {
  addFeedbackResponse,
  askedPersonNames,
  canReplyToFeedbackRequest,
} from "../utils/taskFeedback";
import { deleteImagesFromStorage } from "../utils/imageAttachments";
import { isStoredRichTextBody, richTextHasContent, storagePathsInUpdatesHtml } from "../utils/richTextImages";
import { PersonNameInline } from "./PersonAvatar";
import { ImageAttachmentGallery } from "./ImageAttachmentGallery";
import { MentionTextarea, renderTextWithMentions } from "./MentionTextarea";
import { SimpleRichText, SimpleRichTextView } from "./SimpleRichText";
import { formatInOrgTime } from "../utils/orgTimezone";
import {
  clearTaskCommentDraft,
  readTaskCommentDraft,
  writeTaskCommentDraft,
} from "../utils/taskCommentDraftStorage";

const COMMENTS_PAGE_SIZE = 10;

function formatTime(iso: string): string {
  return formatInOrgTime(iso, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FeedbackRequestCard({
  request,
  taskId,
  people,
  currentUserId,
  onReply,
}: {
  request: TaskFeedbackRequest;
  taskId: string;
  people: Person[];
  currentUserId: string;
  onReply: (requestId: string, body: string) => void | Promise<void>;
}) {
  const [replyHtml, setReplyHtml] = useState("");
  const [posting, setPosting] = useState(false);
  const replyHtmlRef = useRef("");
  const replySubmittedRef = useRef(false);
  replyHtmlRef.current = replyHtml;
  const requester = people.find((p) => p.id === request.requestedById)?.name ?? "Someone";
  const asked = askedPersonNames(request, people);
  const resolved = request.status === "resolved";
  const canReply = canReplyToFeedbackRequest(request, currentUserId);

  const line = resolved
    ? `Feedback given · from ${requester} · for ${asked || "—"} · ${formatTime(request.createdAt)}`
    : `Feedback requested · from ${requester} · for ${asked || "—"} · ${formatTime(request.createdAt)}`;

  useEffect(() => {
    replySubmittedRef.current = false;
    return () => {
      if (replySubmittedRef.current) return;
      const paths = storagePathsInUpdatesHtml(replyHtmlRef.current);
      if (paths.length > 0) void deleteImagesFromStorage(paths);
    };
  }, [request.id]);

  async function sendReply() {
    if (!richTextHasContent(replyHtml) || posting) return;
    setPosting(true);
    try {
      await onReply(request.id, replyHtml);
      replySubmittedRef.current = true;
      setReplyHtml("");
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
            const person = people.find((p) => p.id === res.personId);
            return (
              <li
                key={`${res.personId}-${res.createdAt}`}
                className="rounded-lg border border-amber-200/60 bg-white/80 px-2 py-1.5"
              >
                <p className="flex flex-wrap items-center gap-x-1 text-[10px] font-medium text-amber-900">
                  <PersonNameInline
                    person={person}
                    name={person?.name ?? "Someone"}
                    className="[&>span:first-child]:text-amber-900 [&>span:first-child]:font-medium"
                  />
                  <span className="font-normal text-amber-800/80">· {formatTime(res.createdAt)}</span>
                </p>
                {res.body &&
                  (isStoredRichTextBody(res.body) ? (
                    <SimpleRichTextView
                      html={res.body}
                      className="mt-0.5 px-0 py-0 text-amber-950"
                      collapseKey={`feedback-res-${request.id}-${res.personId}-${res.createdAt}`}
                    />
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-amber-950">{res.body}</p>
                  ))}
                <ImageAttachmentGallery
                  scopeKey={`feedback-${request.id}-${res.personId}-${res.createdAt}`}
                  attachments={res.attachments}
                  size="sm"
                />
              </li>
            );
          })}
        </ul>
      )}

      {canReply && (
        <div className="relative z-30 mt-2 border-t border-amber-300/50 pt-2">
          <p className="mb-1.5 text-[11px] font-medium text-amber-950">Your feedback</p>
          <SimpleRichText
            value={replyHtml}
            onChange={setReplyHtml}
            placeholder="Write feedback…"
            className="border-amber-200/80"
            collapseKey={`feedback-reply-${request.id}`}
            inlineImageStorageDir={`tasks/${taskId}/feedback`}
          />
          <button
            type="button"
            disabled={posting || !richTextHasContent(replyHtml)}
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
  updateMentions,
  onUpdateMentionClick,
}: {
  comment: TaskComment;
  people: Person[];
  currentUserId: string;
  onVote: (commentId: string, vote: "like" | "dislike") => void;
  updateMentions: ReturnType<typeof updateMentionLabels>;
  onUpdateMentionClick?: (updateId: string) => void;
}) {
  const author = people.find((p) => p.id === c.authorId);
  const isMe = c.authorId === currentUserId;
  const likes = c.reactions?.likes ?? [];
  const dislikes = c.reactions?.dislikes ?? [];
  const liked = likes.includes(currentUserId);
  const disliked = dislikes.includes(currentUserId);
  const hasReactions = likes.length > 0 || dislikes.length > 0;
  const showOnHoverOnly =
    "hidden group-hover:inline-flex group-focus-within:inline-flex [@media(pointer:coarse)]:inline-flex";

  return (
    <li className="group relative rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2">
      <div className="pointer-events-auto absolute right-2 top-2 z-[1]">
        <div
          className={`flex items-center gap-0.5 transition-opacity duration-150 ${
            hasReactions
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100"
          }`}
        >
          <button
            type="button"
            title={likes.length ? `${likes.length} like${likes.length === 1 ? "" : "s"}` : "Like"}
            aria-pressed={liked}
            aria-label={liked ? "Remove like" : "Like"}
            onClick={() => onVote(c.id, "like")}
            className={`items-center gap-0.5 rounded px-1 py-px text-sm leading-none transition-colors ${
              hasReactions && likes.length > 0
                ? "inline-flex"
                : hasReactions
                  ? showOnHoverOnly
                  : "inline-flex"
            } ${
              liked
                ? "bg-sky-100 text-sky-950 ring-1 ring-sky-400/70"
                : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
            }`}
          >
            <span>👍</span>
            {likes.length > 0 && (
              <span className="text-[11px] font-medium tabular-nums">{likes.length}</span>
            )}
          </button>
          <button
            type="button"
            title={dislikes.length ? `${dislikes.length} dislike${dislikes.length === 1 ? "" : "s"}` : "Dislike"}
            aria-pressed={disliked}
            aria-label={disliked ? "Remove dislike" : "Dislike"}
            onClick={() => onVote(c.id, "dislike")}
            className={`items-center gap-0.5 rounded px-1 py-px text-sm leading-none transition-colors ${
              hasReactions && dislikes.length > 0
                ? "inline-flex"
                : hasReactions
                  ? showOnHoverOnly
                  : "inline-flex"
            } ${
              disliked
                ? "bg-rose-100 text-rose-950 ring-1 ring-rose-400/70"
                : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
            }`}
          >
            <span>👎</span>
            {dislikes.length > 0 && (
              <span className="text-[11px] font-medium tabular-nums">{dislikes.length}</span>
            )}
          </button>
        </div>
      </div>

      <p className="flex min-w-0 flex-wrap items-center gap-x-1 pr-[4.5rem] text-[11px] font-medium text-slate-600">
        <PersonNameInline
          person={author}
          name={author?.name ?? "Unknown"}
          highlight={isMe}
          className="[&>span:first-child]:text-slate-600"
        />
        {isMe && <span className="font-normal text-slate-400">· you</span>}
        <span className="font-normal text-slate-400">· {formatTime(c.createdAt)}</span>
      </p>
      {c.body && (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {renderTextWithMentions(c.body, people, {
            updateMentions,
            onUpdateMentionClick,
          })}
        </p>
      )}
      <ImageAttachmentGallery
        scopeKey={`comment-${c.id}`}
        attachments={c.attachments}
        size="sm"
      />
    </li>
  );
}

export function TaskCommentsSection({
  task,
  people,
  projects,
  currentUserId,
  onChange,
  onCommentPosted,
  onCommentReaction,
  onFeedbackReply,
}: {
  task: Task;
  people: Person[];
  projects: Project[];
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
  const [draft, setDraft] = useState(() => readTaskCommentDraft(task.id, currentUserId)?.body ?? "");
  const [draftAttachments, setDraftAttachments] = useState<ImageAttachment[]>([]);
  const [draftImagesUploading, setDraftImagesUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(() =>
    Boolean(readTaskCommentDraft(task.id, currentUserId)?.body.trim())
  );
  const draftAttachmentsRef = useRef<ImageAttachment[]>([]);
  draftAttachmentsRef.current = draftAttachments;
  const [visibleCommentCount, setVisibleCommentCount] = useState(COMMENTS_PAGE_SIZE);

  const mentionablePeople = useMemo(
    () => peopleMentionableOnTask(task, people, projects),
    [task, people, projects]
  );
  const mentionableDepartments = useMemo(
    () => departmentsMentionableOnTask(task, projects),
    [task, projects]
  );

  const updateMentions = updateMentionLabels(task, people);
  const updatePreviews = Object.fromEntries(
    taskUpdateEntries(task, people).map((entry) => [entry.id, updatePreviewPlain(entry)])
  );

  function scrollToUpdate(updateId: string) {
    const el = document.getElementById(`task-update-${updateId}`);
    if (!el) return;
    el.dispatchEvent(new Event(TASK_UPDATE_EXPAND_EVENT, { bubbles: false }));
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.classList.add("ring-2", "ring-accent/40");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-accent/40"), 1600);
  }

  const feedbackSorted = [...(task.feedbackRequests ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const totalItems = feedbackSorted.length + task.comments.length;

  useEffect(() => {
    const saved = readTaskCommentDraft(task.id, currentUserId);
    setDraft(saved?.body ?? "");
    setSectionOpen(Boolean(saved?.body.trim()));
    setVisibleCommentCount(COMMENTS_PAGE_SIZE);
    const orphans = draftAttachmentsRef.current;
    setDraftAttachments([]);
    if (orphans.length > 0) {
      void deleteImagesFromStorage(orphans.map((a) => a.storagePath));
    }
  }, [task.id, currentUserId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!draft.trim()) {
        clearTaskCommentDraft(task.id, currentUserId);
        return;
      }
      writeTaskCommentDraft(task.id, currentUserId, {
        body: draft,
        updatedAt: new Date().toISOString(),
      });
    }, 150);
    return () => window.clearTimeout(id);
  }, [draft, task.id, currentUserId]);

  const visibleComments =
    task.comments.length <= visibleCommentCount
      ? task.comments
      : task.comments.slice(task.comments.length - visibleCommentCount);
  const hiddenOlderCount = task.comments.length - visibleComments.length;
  const olderBatch = Math.min(COMMENTS_PAGE_SIZE, hiddenOlderCount);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (posting || draftImagesUploading || (!draft.trim() && draftAttachments.length === 0)) return;
    setPosting(true);
    try {
      const next = appendTaskComment(task, currentUserId, draft, draftAttachments);
      if (next.length === task.comments.length) return;
      const added = next[next.length - 1]!;
      clearTaskCommentDraft(task.id, currentUserId);
      setDraft("");
      setDraftAttachments([]);
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
                  taskId={task.id}
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
                    updateMentions={updateMentions}
                    onUpdateMentionClick={scrollToUpdate}
                  />
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              placeholder="Add a comment… (@ person, department, or update)"
              people={mentionablePeople}
              excludePersonId={currentUserId}
              departmentOptions={mentionableDepartments}
              updateMentions={updateMentions}
              updatePreviews={updatePreviews}
              imageStorageDir={`tasks/${task.id}/comments`}
              imageAttachments={draftAttachments}
              onImageAttachmentsChange={setDraftAttachments}
              onImageUploadingChange={setDraftImagesUploading}
              imageDisabled={posting}
            />
            <button
              type="submit"
              disabled={
                posting ||
                draftImagesUploading ||
                (!draft.trim() && draftAttachments.length === 0)
              }
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
