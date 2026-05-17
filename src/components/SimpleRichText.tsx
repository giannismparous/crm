import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { sanitizeTaskUpdates } from "../utils/sanitizeRichText";

const HIGHLIGHT_COLOR = "#fef9c3";
/** Default visible height for updates (matches min-height). */
export const UPDATES_COLLAPSED_MAX = "4.5rem";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** When set, new typing is tagged with data-author for multi-user color view. */
  authorId?: string;
  className?: string;
  /** Cap height until user expands; shows “… Show more” / “Show less”. */
  collapsible?: boolean;
  /** Resets expand/collapse when task changes. */
  collapseKey?: string;
};

const COLLAPSED_HEIGHT_PX = 72;

function useCollapsibleBody(
  collapseKey: string | undefined,
  watchHtml: string,
  collapsible: boolean,
  bodyRef: RefObject<HTMLDivElement | null>,
  options?: { autoExpandWhileFocused?: boolean; isFocused?: boolean }
) {
  const autoExpandWhileFocused = options?.autoExpandWhileFocused ?? false;
  const isFocused = options?.isFocused ?? false;
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const effectiveExpanded =
    expanded || (autoExpandWhileFocused && isFocused && overflows);

  useEffect(() => {
    setExpanded(false);
  }, [collapseKey]);

  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el || !collapsible) {
      setOverflows(false);
      return;
    }
    const hasContent =
      (el.textContent ?? "").trim().length > 0 ||
      Boolean(el.querySelector("img, table, ul, ol"));
    if (!hasContent) {
      setOverflows(false);
      return;
    }
    setOverflows(el.scrollHeight > COLLAPSED_HEIGHT_PX + 2);
  }, [collapsible]);

  useEffect(() => {
    measure();
  }, [measure, watchHtml, collapseKey, expanded, isFocused]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const mo = new MutationObserver(() => measure());
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure, collapseKey]);

  const showToggle = collapsible && overflows && !(autoExpandWhileFocused && isFocused);

  const collapseToggle = showToggle ? (
    <div className="border-t border-slate-100 px-2 py-1">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="text-xs font-medium text-accent hover:underline"
      >
        {effectiveExpanded ? "Show less" : "… Show more"}
      </button>
    </div>
  ) : null;

  const bodyClampClass = collapsible && !effectiveExpanded ? "max-h-[4.5rem] overflow-hidden" : "";

  return { bodyClampClass, collapseToggle };
}

function hasHighlightInSelection(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  let node: Node | null = sel.anchorNode;
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "MARK") return true;
      if (el.hasAttribute("data-author")) continue;
      const bg = el.style.backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return true;
    }
    node = node.parentNode;
  }
  return false;
}

function unwrapHighlightedSpans(root: HTMLElement) {
  const sel = window.getSelection();
  const spans = root.querySelectorAll("span[style*='background']:not([data-author]), mark");
  spans.forEach((el) => {
    if (sel?.rangeCount && !sel.getRangeAt(0).intersectsNode(el)) return;
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
}

function authorSpanForCaret(root: HTMLElement, authorId: string): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  let node: Node | null = sel.anchorNode;
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "SPAN" && el.getAttribute("data-author") === authorId) return el;
    }
    node = node.parentNode;
  }
  return null;
}

function ensureAuthorSpan(root: HTMLElement, authorId: string) {
  if (authorSpanForCaret(root, authorId)) return;

  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;

  const span = document.createElement("span");
  span.setAttribute("data-author", authorId);

  if (range.collapsed) {
    range.insertNode(span);
    const zwsp = document.createTextNode("\u200b");
    span.appendChild(zwsp);
    range.setStart(zwsp, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  try {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore range errors */
  }
}

export function SimpleRichText({
  value,
  onChange,
  placeholder = "Add progress notes…",
  minHeight = UPDATES_COLLAPSED_MAX,
  authorId,
  className = "",
  collapsible = false,
  collapseKey,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const { bodyClampClass, collapseToggle } = useCollapsibleBody(collapseKey, value, collapsible, ref, {
    autoExpandWhileFocused: collapsible,
    isFocused,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef(value);
  const focused = useRef(false);

  const syncFromProp = useCallback(() => {
    const el = ref.current;
    if (!el || focused.current) return;

    const safe = sanitizeTaskUpdates(value);
    const domSafe = sanitizeTaskUpdates(el.innerHTML);
    if (safe === lastEmitted.current && domSafe === safe) return;

    if (domSafe !== safe) el.innerHTML = safe || "";
    lastEmitted.current = safe;
  }, [value]);

  useEffect(() => {
    syncFromProp();
  }, [syncFromProp]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const safe = sanitizeTaskUpdates(el.innerHTML);
    if (safe !== lastEmitted.current) {
      lastEmitted.current = safe;
      onChange(safe);
    }
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(emit, 600);
  }

  function onEditInput() {
    const el = ref.current;
    if (el && authorId) ensureAuthorSpan(el, authorId);
    scheduleSave();
  }

  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onEditInput();
  }

  function toggleHighlight() {
    const el = ref.current;
    if (!el) return;
    el.focus();

    if (hasHighlightInSelection(el)) {
      document.execCommand("hiliteColor", false, "transparent");
      document.execCommand("backColor", false, "transparent");
      unwrapHighlightedSpans(el);
    } else {
      document.execCommand("hiliteColor", false, HIGHLIGHT_COLOR);
    }
    onEditInput();
  }

  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100/80 ${className}`}>
      <div className="flex items-center gap-0.5 border-b border-slate-100 px-1.5 py-1">
        <ToolbarBtn label="Bold" onClick={() => exec("bold")}>
          <span className="font-bold">B</span>
        </ToolbarBtn>
        <ToolbarBtn label="Underline" onClick={() => exec("underline")}>
          <span className="underline">U</span>
        </ToolbarBtn>
        <ToolbarBtn label="Highlight (click again to remove)" onClick={toggleHighlight}>
          <span className="rounded px-1" style={{ backgroundColor: HIGHLIGHT_COLOR }}>
            H
          </span>
        </ToolbarBtn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        onFocus={() => {
          focused.current = true;
          setIsFocused(true);
          if (authorId && ref.current) ensureAuthorSpan(ref.current, authorId);
        }}
        onBlur={() => {
          focused.current = false;
          setIsFocused(false);
          if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
          }
          emit();
        }}
        onInput={onEditInput}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          onEditInput();
        }}
        className={`simple-rich-text min-h-[4.5rem] px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] ${bodyClampClass}`}
        style={{ minHeight }}
      />
      {collapseToggle}
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

export function SimpleRichTextView({
  html,
  className = "",
  collapsible = false,
  collapseKey,
}: {
  html: string;
  className?: string;
  collapsible?: boolean;
  collapseKey?: string;
}) {
  const safe = sanitizeTaskUpdates(html);
  const viewRef = useRef<HTMLDivElement>(null);
  const { bodyClampClass, collapseToggle } = useCollapsibleBody(collapseKey, safe, collapsible, viewRef);
  if (!safe) return null;
  return (
    <>
      <div
        ref={viewRef}
        className={`simple-rich-text px-3 py-2 text-sm leading-relaxed text-slate-800 ${bodyClampClass} ${className}`}
        dangerouslySetInnerHTML={{ __html: safe }}
      />
      {collapseToggle}
    </>
  );
}
