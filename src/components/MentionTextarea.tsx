import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ImageAttachment, Person } from "../types";
import { isKeyboardComposing } from "../utils/keyboardComposition";
import { TEAM_DEPARTMENTS, departmentChipClass } from "../types";
import type { UpdateMentionOption } from "../utils/mentions";
import { useT, useI18n } from "../contexts/I18nContext";
import { translateDepartment } from "../i18n/helpers";
import { InlineImageAttachments } from "./InlineImageAttachments";

export type MentionSuggestion =
  | { kind: "person"; id: string; label: string }
  | { kind: "department"; id: string; label: string }
  | { kind: "update"; id: string; label: string; preview?: string };

function getMentionState(text: string, cursor: number) {
  const before = text.slice(0, cursor);
  const match = /(^|[\s(])@([^\s@]*)$/.exec(before);
  if (!match) return null;
  const query = match[2];
  const atIndex = before.length - query.length - 1;
  return { query, atIndex };
}

function buildSuggestions(
  query: string,
  people: Person[],
  updateMentions: UpdateMentionOption[],
  updatePreviews: Record<string, string>,
  excludePersonId?: string,
  departmentOptions?: string[]
): MentionSuggestion[] {
  const q = query.toLowerCase();
  const hiddenPersonId = excludePersonId?.trim();
  const departments = departmentOptions ?? TEAM_DEPARTMENTS;

  const updateHits: MentionSuggestion[] = updateMentions
    .filter((u) => !q || u.label.toLowerCase().includes(q))
    .slice(0, 6)
    .map((u) => ({
      kind: "update" as const,
      id: u.id,
      label: u.label,
      preview: updatePreviews[u.id],
    }));

  const peopleHits: MentionSuggestion[] = people
    .filter((p) => p.id !== hiddenPersonId && (!q || p.name.toLowerCase().includes(q)))
    .slice(0, 8)
    .map((p) => ({ kind: "person" as const, id: p.id, label: p.name }));

  const deptHits: MentionSuggestion[] = departments
    .filter((d) => !q || d.toLowerCase().includes(q))
    .slice(0, 6)
    .map((d) => ({ kind: "department" as const, id: d, label: d }));

  return [...updateHits, ...peopleHits, ...deptHits].slice(0, 14);
}

/** Plain-text @mentions: `@Jane Doe`, `@Sales`, or `@Update #1`. */
export function insertMention(text: string, atIndex: number, queryLen: number, label: string) {
  const token = `@${label} `;
  return text.slice(0, atIndex) + token + text.slice(atIndex + 1 + queryLen);
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
  people,
  excludePersonId,
  departmentOptions,
  updateMentions = [],
  updatePreviews = {},
  className = "",
  imageFiles,
  onImageFilesChange,
  imageStorageDir,
  imageAttachments,
  onImageAttachmentsChange,
  onImageUploadingChange,
  imageDisabled,
  imageUploading,
  imageUploadingIndices,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  people: Person[];
  /** Logged-in user — hidden from @ suggestions (you can't notify yourself). */
  excludePersonId?: string;
  /** When set, only these departments appear in @ suggestions (e.g. task assignee depts). */
  departmentOptions?: string[];
  updateMentions?: UpdateMentionOption[];
  updatePreviews?: Record<string, string>;
  className?: string;
  imageFiles?: File[];
  onImageFilesChange?: (files: File[]) => void;
  imageStorageDir?: string;
  imageAttachments?: ImageAttachment[];
  onImageAttachmentsChange?: (attachments: ImageAttachment[]) => void;
  onImageUploadingChange?: (uploading: boolean) => void;
  imageDisabled?: boolean;
  imageUploading?: boolean;
  imageUploadingIndices?: ReadonlySet<number>;
}) {
  const t = useT();
  const { locale } = useI18n();
  const imagesEnabled =
    onImageFilesChange !== undefined || onImageAttachmentsChange !== undefined;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MentionSuggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const mentionRef = useRef<{ atIndex: number; query: string } | null>(null);

  const refreshSuggestions = useCallback(
    (text: string, cursor: number) => {
      const ctx = getMentionState(text, cursor);
      if (!ctx) {
        setOpen(false);
        mentionRef.current = null;
        return;
      }
      mentionRef.current = ctx;
      const list = buildSuggestions(
        ctx.query,
        people,
        updateMentions,
        updatePreviews,
        excludePersonId,
        departmentOptions
      );
      setItems(list);
      setHighlight(0);
      setOpen(list.length > 0);
    },
    [people, excludePersonId, departmentOptions, updateMentions, updatePreviews]
  );

  function applySuggestion(item: MentionSuggestion) {
    const el = ref.current;
    const ctx = mentionRef.current;
    if (!el || !ctx) return;
    const next = insertMention(value, ctx.atIndex, ctx.query.length, item.label);
    onChange(next);
    setOpen(false);
    mentionRef.current = null;
    const cursor = ctx.atIndex + item.label.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  function onValueChange(text: string) {
    onChange(text);
    const cursor = ref.current?.selectionStart ?? text.length;
    refreshSuggestions(text, cursor);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isKeyboardComposing(e)) return;
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + items.length) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applySuggestion(items[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const updateItems = items.filter((i) => i.kind === "update");
  const peopleItems = items.filter((i) => i.kind === "person");
  const deptItems = items.filter((i) => i.kind === "department");

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        onClick={() => refreshSuggestions(value, ref.current?.selectionStart ?? 0)}
        onKeyUp={() => refreshSuggestions(value, ref.current?.selectionStart ?? 0)}
        placeholder={placeholder}
        rows={rows}
        className={`input-base resize-y text-sm ${imagesEnabled ? "pb-10" : ""}`}
      />
      {imagesEnabled && (
        <InlineImageAttachments
          files={imageFiles}
          onChange={onImageFilesChange}
          storageDir={imageStorageDir}
          attachments={imageAttachments}
          onAttachmentsChange={onImageAttachmentsChange}
          onUploadingChange={onImageUploadingChange}
          disabled={imageDisabled}
          uploading={imageUploading}
          uploadingIndices={imageUploadingIndices}
        />
      )}
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
          role="listbox"
        >
          {updateItems.length > 0 && (
            <>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t("tasks.updates.title")}
              </p>
              {updateItems.map((item) => {
                const idx = items.indexOf(item);
                return (
                  <button
                    key={`u-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === highlight}
                    className={`flex w-full flex-col px-2 py-1.5 text-left text-sm ${
                      idx === highlight ? "bg-accent/10 text-slate-900" : "text-slate-800 hover:bg-slate-50"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(item)}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <span className="font-medium text-accent">@{item.label}</span>
                    {"preview" in item && item.preview && (
                      <span className="truncate text-[11px] text-slate-500">{item.preview}</span>
                    )}
                  </button>
                );
              })}
            </>
          )}
          {peopleItems.length > 0 && (
            <>
              <p className="mt-0.5 border-t border-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t("common.people")}
              </p>
              {peopleItems.map((item) => {
                const idx = items.indexOf(item);
                return (
                  <button
                    key={`p-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === highlight}
                    className={`flex w-full px-2 py-1.5 text-left text-sm ${
                      idx === highlight ? "bg-accent/10 text-slate-900" : "text-slate-800 hover:bg-slate-50"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(item)}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <span className="font-medium">@{item.label}</span>
                  </button>
                );
              })}
            </>
          )}
          {deptItems.length > 0 && (
            <>
              <p className="mt-0.5 border-t border-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t("common.departments")}
              </p>
              {deptItems.map((item) => {
                const idx = items.indexOf(item);
                return (
                  <button
                    key={`d-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === highlight}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                      idx === highlight ? "bg-accent/10" : "hover:bg-slate-50"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(item)}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${departmentChipClass(item.label)}`}
                    >
                      {translateDepartment(locale, item.label)}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type RenderMentionOptions = {
  updateMentions?: UpdateMentionOption[];
  onUpdateMentionClick?: (updateId: string) => void;
};

/** Renders comment text with @mentions highlighted. */
export function renderTextWithMentions(body: string, people: Person[], options: RenderMentionOptions = {}) {
  const updateMentions = options.updateMentions ?? [];
  const names = [
    ...updateMentions.map((u) => u.label),
    ...people.map((p) => p.name),
    ...TEAM_DEPARTMENTS,
  ].sort((a, b) => b.length - a.length);

  const updateByLabel = new Map(updateMentions.map((u) => [u.label, u.id]));

  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < body.length) {
    if (body[i] === "@") {
      let matched = "";
      for (const name of names) {
        if (body.slice(i + 1).startsWith(name)) {
          matched = name;
          break;
        }
      }
      if (matched) {
        const updateId = updateByLabel.get(matched);
        if (updateId && options.onUpdateMentionClick) {
          out.push(
            <button
              key={key++}
              type="button"
              onClick={() => options.onUpdateMentionClick?.(updateId)}
              className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-dim"
            >
              @{matched}
            </button>
          );
        } else {
          out.push(
            <span key={key++} className={`font-medium ${updateId ? "text-accent" : "text-accent"}`}>
              @{matched}
            </span>
          );
        }
        i += 1 + matched.length;
        continue;
      }
    }
    let j = i + 1;
    while (j < body.length && body[j] !== "@") j++;
    out.push(<span key={key++}>{body.slice(i, j)}</span>);
    i = j;
  }
  return out.length > 0 ? out : body;
}
