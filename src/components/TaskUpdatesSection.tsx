import { useState } from "react";
import type { Person, Task } from "../types";
import { getTaskWorkerIds } from "../utils/taskAssignees";
import { authorColorForWorker } from "../utils/taskAuthorColors";
import { authorIdsInUpdates } from "../utils/sanitizeRichText";
import {
  taskUpdatesContent,
  taskUpdatesHasContent,
  taskUsesMultiAuthorUpdates,
} from "../utils/taskUpdates";
import { PersonAvatar } from "./PersonAvatar";
import { SimpleRichText, SimpleRichTextView } from "./SimpleRichText";

function AuthorColorStyles({
  scopeClass,
  workers,
  enabled,
}: {
  scopeClass: string;
  workers: string[];
  enabled: boolean;
}) {
  if (!enabled) return null;
  const rules = workers
    .map((id) => {
      const { bg } = authorColorForWorker(workers, id);
      return `.${scopeClass} [data-author="${id}"] { background-color: ${bg}; border-radius: 2px; }`;
    })
    .join("\n");
  return <style>{rules}</style>;
}

export function TaskUpdatesSection({
  task,
  people,
  currentUserId,
  isWorker,
  canEditUpdates,
  onChange,
}: {
  task: Task;
  people: Person[];
  currentUserId: string;
  isWorker: boolean;
  /** False when task is completed/canceled — workers see read-only updates. */
  canEditUpdates: boolean;
  onChange: (patch: Partial<Task>) => void;
}) {
  const workers = getTaskWorkerIds(task, people);
  const multi = taskUsesMultiAuthorUpdates(task, people);
  const [showByAuthor, setShowByAuthor] = useState(false);
  const content = taskUpdatesContent(task, people);
  const scopeClass = `updates-scope-${task.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const scopeClasses = `${scopeClass}${showByAuthor && multi ? " show-author-colors" : ""}`;
  const authorIds = multi ? authorIdsInUpdates(content) : [];

  if (!isWorker && !taskUpdatesHasContent(task, people)) return null;

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">Updates</p>
        {multi && content.trim() && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showByAuthor}
              onChange={(e) => setShowByAuthor(e.target.checked)}
              className="rounded border-slate-300 text-accent focus:ring-accent/30"
            />
            Show who wrote what
          </label>
        )}
      </div>

      <AuthorColorStyles scopeClass={scopeClass} workers={workers} enabled={showByAuthor && multi} />

      {canEditUpdates ? (
        <SimpleRichText
          key={task.id}
          value={content}
          authorId={multi ? currentUserId : undefined}
          className={scopeClasses}
          collapsible
          collapseKey={task.id}
          taskId={task.id}
          enableGenericFileAttach
          onChange={(updates) => onChange({ updates, updatesByUser: {} })}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80">
          <SimpleRichTextView
            html={content}
            className={scopeClasses}
            collapsible
            collapseKey={task.id}
          />
        </div>
      )}

      {multi && showByAuthor && authorIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {authorIds.map((id) => {
            const { bg, border } = authorColorForWorker(workers, id);
            const person = people.find((p) => p.id === id);
            const name = person?.name ?? "Unknown";
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 pr-2 text-[10px] font-medium text-slate-700"
                style={{ backgroundColor: bg, boxShadow: `inset 0 0 0 1px ${border}55` }}
              >
                {name}
                <PersonAvatar person={person} name={name} size="sm" className="avatar-ring-sm shadow-none" />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
