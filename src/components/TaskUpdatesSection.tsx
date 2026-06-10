import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText, Image as ImageIcon, Music, Plus, Video } from "lucide-react";
import type { Person, Task } from "../types";
import {
  appendTaskUpdate,
  taskUpdateEntries,
  taskUpdatesHasContent,
  updateContributors,
} from "../utils/taskUpdates";
import { TASK_UPDATE_EXPAND_EVENT } from "../utils/taskUpdateEntries";
import {
  clearTaskUpdateDraft,
  readTaskUpdateDraft,
  writeTaskUpdateDraft,
} from "../utils/taskUpdateDraftStorage";
import { buildTaskUpdateTitleContext, fallbackTaskUpdateTitle } from "../utils/taskUpdateTitle";
import { requestTaskUpdateTitle } from "../firebase/generateUpdateTitle";
import {
  countUpdateMediaInHtml,
  richTextHasContent,
  updateMediaCountLabel,
} from "../utils/richTextImages";
import { formatInOrgTime } from "../utils/orgTimezone";
import { PersonAvatarStack, PersonNamesInline } from "./PersonAvatar";
import { ShimmerPlaceholder } from "./ShimmerPlaceholder";
import { SimpleRichText, SimpleRichTextView } from "./SimpleRichText";

type ComposeStep = "editing" | "generatingTitle" | "reviewTitle" | "customTitle" | "saving";

function formatUpdateTime(iso: string): string {
  return formatInOrgTime(iso, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function restoreDraftState(taskId: string, userId: string) {
  const stored = readTaskUpdateDraft(taskId, userId);
  const body = stored?.body ?? "";
  const composeId = stored?.composeId ?? crypto.randomUUID();
  const composing = stored ? stored.composing || richTextHasContent(body) : false;
  return { body, composeId, composing };
}

const UPDATE_MEDIA_BADGES = [
  { key: "images" as const, Icon: ImageIcon, label: "images", chip: "bg-sky-50 text-sky-700 ring-sky-200/80" },
  { key: "videos" as const, Icon: Video, label: "videos", chip: "bg-violet-50 text-violet-700 ring-violet-200/80" },
  { key: "audio" as const, Icon: Music, label: "audio", chip: "bg-amber-50 text-amber-800 ring-amber-200/80" },
  { key: "files" as const, Icon: FileText, label: "files", chip: "bg-slate-100 text-slate-700 ring-slate-200/80" },
];

function UpdateMediaBadges({ html, className = "" }: { html: string; className?: string }) {
  const counts = useMemo(() => countUpdateMediaInHtml(html), [html]);
  const items = UPDATE_MEDIA_BADGES.map((badge) => ({
    ...badge,
    count: counts[badge.key],
  })).filter((item) => item.count > 0);

  if (items.length === 0) return null;

  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 ${className}`} aria-label="Attached media">
      {items.map(({ key, Icon, label, chip, count }) => (
        <span
          key={key}
          title={`${count} ${label}`}
          className={`inline-flex items-center gap-0.5 rounded-md px-1 py-px ring-1 ring-inset ${chip}`}
        >
          <Icon className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
          <span className="text-[9px] font-bold leading-none tabular-nums">{updateMediaCountLabel(count)}</span>
        </span>
      ))}
    </span>
  );
}

function UpdateTitlePreviewRow({
  updateNumber,
  title,
  bodyHtml = "",
}: {
  updateNumber: number;
  title: string | null;
  bodyHtml?: string;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-sm"
      aria-live="polite"
      aria-busy={title === null}
    >
      <span className="shrink-0 rounded bg-accent/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
        Update #{updateNumber}
      </span>
      <span className="shrink-0 text-[9px] font-medium text-slate-400">-</span>
      {title ? (
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-slate-700 transition-opacity duration-300 ease-out">
          {title}
        </span>
      ) : (
        <span className="relative h-3.5 min-w-[6rem] max-w-[14rem] flex-1 overflow-hidden rounded bg-slate-100">
          <ShimmerPlaceholder roundedClassName="rounded" />
        </span>
      )}
      <UpdateMediaBadges html={bodyHtml} />
    </div>
  );
}

function UpdateCard({
  entry,
  index,
  people,
}: {
  entry: ReturnType<typeof taskUpdateEntries>[number];
  index: number;
  people: Person[];
}) {
  const articleRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const contributors = updateContributors(entry, people);
  const contributorLabel = contributors.map((p) => p.name.trim() || "Someone").join(", ");
  const title = entry.title?.trim() ?? "";

  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const onExpand = () => setExpanded(true);
    el.addEventListener(TASK_UPDATE_EXPAND_EVENT, onExpand);
    return () => el.removeEventListener(TASK_UPDATE_EXPAND_EVENT, onExpand);
  }, []);

  return (
    <article
      ref={articleRef}
      id={`task-update-${entry.id}`}
      className="scroll-mt-4 rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1 text-left hover:bg-slate-50/80"
        aria-expanded={expanded}
      >
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <span className="shrink-0 rounded bg-accent/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
            Update #{index + 1}
          </span>
          {title && (
            <>
              <span className="shrink-0 text-[9px] font-medium text-slate-400">-</span>
              <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-slate-700">{title}</span>
              <UpdateMediaBadges html={entry.body} />
            </>
          )}
          {!title && <UpdateMediaBadges html={entry.body} className="ml-0.5" />}
        </span>
        <span className="ml-auto inline-flex min-w-0 shrink-0 items-center gap-1 text-[11px] leading-tight text-slate-600">
          {contributors.length > 0 && (
            <>
              <span className="max-w-[9rem] truncate" title={contributorLabel}>
                <PersonNamesInline people={contributors} stopPropagation />
              </span>
              <PersonAvatarStack people={contributors} size="2xs" stopPropagation />
            </>
          )}
          <span className="shrink-0 text-slate-400">· {formatUpdateTime(entry.createdAt)}</span>
        </span>
      </button>
      {expanded && (
        <SimpleRichTextView
          html={entry.body}
          className="border-t border-slate-100 bg-slate-50/50 rounded-b-xl"
        />
      )}
    </article>
  );
}

export function TaskUpdatesSection({
  task,
  people,
  projectName,
  currentUserId,
  isWorker,
  canEditUpdates,
  onChange,
}: {
  task: Task;
  people: Person[];
  projectName: string;
  currentUserId: string;
  isWorker: boolean;
  canEditUpdates: boolean;
  onChange: (patch: Partial<Task>) => void;
}) {
  const entries = taskUpdateEntries(task, people);
  const initial = restoreDraftState(task.id, currentUserId);
  const [composing, setComposing] = useState(initial.composing);
  const [draft, setDraft] = useState(initial.body);
  const [composeId, setComposeId] = useState(initial.composeId);
  const [composeStep, setComposeStep] = useState<ComposeStep>("editing");
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const customTitleRef = useRef<HTMLInputElement>(null);

  const busy = composeStep !== "editing";
  const showTitlePreview =
    composeStep === "generatingTitle" || composeStep === "reviewTitle" || composeStep === "saving";
  const showTitleReview = composeStep === "reviewTitle" && Boolean(pendingTitle?.trim());
  const showCustomTitleInput = composeStep === "customTitle";
  const isSaving = composeStep === "saving";

  useEffect(() => {
    const restored = restoreDraftState(task.id, currentUserId);
    setDraft(restored.body);
    setComposeId(restored.composeId);
    setComposing(restored.composing);
    setComposeStep("editing");
    setPendingTitle(null);
    setCustomTitle("");
  }, [task.id, currentUserId]);

  useEffect(() => {
    if (!canEditUpdates) return;
    if (!composing && !richTextHasContent(draft)) {
      clearTaskUpdateDraft(task.id, currentUserId);
      return;
    }
    if (composeStep !== "editing") return;
    writeTaskUpdateDraft(task.id, currentUserId, {
      body: draft,
      composing,
      composeId,
      updatedAt: new Date().toISOString(),
    });
  }, [task.id, currentUserId, draft, composing, composeId, canEditUpdates, composeStep]);

  useEffect(() => {
    if (composeStep === "customTitle") {
      customTitleRef.current?.focus();
    }
  }, [composeStep]);

  if (!isWorker && !taskUpdatesHasContent(task, people)) return null;

  function resetComposer() {
    clearTaskUpdateDraft(task.id, currentUserId);
    setDraft("");
    setComposing(false);
    setComposeId(crypto.randomUUID());
    setComposeStep("editing");
    setPendingTitle(null);
    setCustomTitle("");
  }

  function discardDraft() {
    if (isSaving) return;
    resetComposer();
  }

  function backToEditing() {
    if (isSaving) return;
    setComposeStep("editing");
    setPendingTitle(null);
    setCustomTitle("");
  }

  async function finalizePush(title: string, fromStep: "reviewTitle" | "customTitle") {
    const safeTitle = title.trim();
    if (!safeTitle || !richTextHasContent(draft)) return;
    setComposeStep("saving");
    try {
      const next = appendTaskUpdate(task, people, currentUserId, draft, safeTitle);
      onChange({ updateEntries: next, updates: "", updatesByUser: {} });
      resetComposer();
    } catch {
      setComposeStep(fromStep);
    }
  }

  async function startTitleReview() {
    if (!richTextHasContent(draft) || busy) return;

    const titleContext = buildTaskUpdateTitleContext(task, people, projectName, draft);
    setComposeStep("generatingTitle");
    setPendingTitle(null);
    try {
      const title = await requestTaskUpdateTitle(titleContext);
      setPendingTitle(title);
      setComposeStep("reviewTitle");
    } catch {
      setPendingTitle(fallbackTaskUpdateTitle(titleContext.newUpdateBody));
      setComposeStep("reviewTitle");
    }
  }

  function acceptGeneratedTitle() {
    if (!pendingTitle?.trim()) return;
    void finalizePush(pendingTitle, "reviewTitle");
  }

  function rejectGeneratedTitle() {
    setComposeStep("customTitle");
    setCustomTitle("");
  }

  function confirmCustomTitle() {
    void finalizePush(customTitle, "customTitle");
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">
          Updates
          {entries.length > 0 && (
            <span className="ml-1 font-normal tabular-nums text-slate-400">({entries.length})</span>
          )}
        </p>
        {canEditUpdates && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New update
          </button>
        )}
      </div>

      {canEditUpdates && composing && (
        <div className={`space-y-2 ${entries.length > 0 ? "mb-3 border-b border-slate-100 pb-3" : ""}`}>
          {showTitlePreview && (
            <div className="space-y-2">
              <UpdateTitlePreviewRow
                updateNumber={entries.length + 1}
                title={
                  composeStep === "generatingTitle"
                    ? null
                    : (pendingTitle ?? (customTitle.trim() || null))
                }
                bodyHtml={draft}
              />
              {showTitleReview && (
                <p className="text-[11px] text-slate-500">Accept this title, or reject to write your own.</p>
              )}
            </div>
          )}

          {showCustomTitleInput && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-slate-600" htmlFor={`update-title-${task.id}`}>
                Write a title
              </label>
              <input
                ref={customTitleRef}
                id={`update-title-${task.id}`}
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Title"
                maxLength={200}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
            </div>
          )}

          <div className={busy ? "pointer-events-none opacity-60 transition-opacity duration-200" : ""}>
            <SimpleRichText
              key={composeId}
              value={draft}
              onChange={setDraft}
              authorId={currentUserId}
              autoFocus={composeStep === "editing"}
              collapseKey={`${task.id}-compose-${composeId}`}
              taskId={task.id}
              inlineImageStorageDir={`tasks/${task.id}/updates/${composeId}`}
              enableGenericFileAttach
              placeholder="What did you deliver or progress on?"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {composeStep === "editing" && (
              <>
                <button
                  type="button"
                  disabled={!richTextHasContent(draft)}
                  onClick={() => void startTitleReview()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50"
                >
                  Push
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </>
            )}

            {composeStep === "generatingTitle" && (
              <button
                type="button"
                disabled
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white opacity-50"
              >
                Generating title…
              </button>
            )}

            {showTitleReview && !isSaving && (
              <>
                <button
                  type="button"
                  onClick={acceptGeneratedTitle}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={rejectGeneratedTitle}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={backToEditing}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
              </>
            )}

            {isSaving && (
              <button
                type="button"
                disabled
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white opacity-50"
              >
                Pushing…
              </button>
            )}

            {showCustomTitleInput && !isSaving && (
              <>
                <button
                  type="button"
                  disabled={!customTitle.trim()}
                  onClick={confirmCustomTitle}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50"
                >
                  Push
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <ol className="space-y-1.5">
          {[...entries].reverse().map((entry, reversedIndex) => {
            const index = entries.length - 1 - reversedIndex;
            return (
              <li key={entry.id}>
                <UpdateCard entry={entry} index={index} people={people} />
              </li>
            );
          })}
        </ol>
      )}

      {entries.length === 0 && !composing && (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-slate-500">
          No updates yet — push one when you have progress to share.
        </p>
      )}
    </div>
  );
}
