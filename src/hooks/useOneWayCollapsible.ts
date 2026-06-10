import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";

/** Visible lines when collapsed (text-sm / leading-relaxed). */
export const COLLAPSED_TEXT_LINES = 5;

/** Min height for empty fields — 5 lines + py-2, aligned to line-height. */
export const COLLAPSED_TEXT_MIN_HEIGHT = "calc(1rem + 5 * 1lh)";

function forceReflow(el: HTMLElement) {
  void el.offsetHeight;
}

/** Measure full content height with all collapse constraints removed. */
export function measureExpandedHeight(el: HTMLElement): number {
  el.style.maxHeight = "none";
  el.style.minHeight = "0";
  el.style.height = "auto";
  el.style.overflow = "hidden";
  forceReflow(el);
  return el.scrollHeight;
}

/** Apply expanded layout on the DOM immediately (before React re-render). */
export function applyExpandedDom(
  el: HTMLElement,
  options?: { lineClamp?: boolean; rootEl?: HTMLElement | null }
) {
  el.classList.remove("is-collapsed");
  if (options?.lineClamp) el.classList.remove("collapsible-lines-5-clamp");
  el.classList.add("is-expanded", "collapsible-lines-5");
  el.dataset.collapsibleExpanded = "true";

  const fullHeight = measureExpandedHeight(el);
  el.style.maxHeight = "none";
  el.style.minHeight = `${fullHeight}px`;
  el.style.height = `${fullHeight}px`;
  el.style.overflow = "hidden";

  if (options?.rootEl) {
    options.rootEl.classList.remove("overflow-hidden");
    options.rootEl.classList.add("overflow-visible");
    options.rootEl.dataset.collapsibleExpanded = "true";
  }
}

/** Let a focused field grow with content immediately (no measured-height delay). */
export function applyEditingDom(el: HTMLElement, rootEl?: HTMLElement | null) {
  el.classList.add("is-editing");
  el.style.height = "auto";
  el.style.minHeight = "";
  el.style.maxHeight = "none";
  el.style.overflow = "visible";
  if (rootEl) {
    rootEl.classList.remove("overflow-hidden");
    rootEl.classList.add("overflow-visible");
  }
}

export function clearExpandedDom(
  el: HTMLElement | null,
  rootEl?: HTMLElement | null
) {
  if (!el) return;
  delete el.dataset.collapsibleExpanded;
  el.style.maxHeight = "";
  el.style.minHeight = "";
  el.style.height = "";
  el.style.overflow = "";
  if (rootEl) {
    delete rootEl.dataset.collapsibleExpanded;
    rootEl.classList.remove("overflow-visible");
    rootEl.classList.add("overflow-hidden");
  }
}

export function contentOverflowsLines(el: HTMLElement, lines: number): boolean {
  const hasMedia = el.querySelector("img, video, audio, a.task-inline-file, table, ul, ol");
  if (hasMedia) return true;

  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight);
  const padding =
    parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  if (!Number.isFinite(lineHeight)) {
    return el.scrollHeight > el.clientHeight + 1;
  }
  const collapsedHeight = padding + lineHeight * lines;
  return el.scrollHeight > collapsedHeight + 1;
}

export function expandedRowsForText(text: string): number {
  const lines = text.split("\n").length;
  return Math.max(COLLAPSED_TEXT_LINES, lines);
}

export function useOneWayCollapsible(
  collapseKey: string | undefined,
  watchContent: string,
  collapsible: boolean,
  bodyRef: RefObject<HTMLElement | null>,
  onExpand?: () => void,
  options?: {
    lineClamp?: boolean;
    unlockCollapsed?: boolean;
    rootRef?: RefObject<HTMLElement | null>;
  }
) {
  const lineClamp = options?.lineClamp ?? false;
  const unlockCollapsed = options?.unlockCollapsed ?? false;
  const rootRef = options?.rootRef;
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const onExpandRef = useRef(onExpand);
  onExpandRef.current = onExpand;

  useEffect(() => {
    setExpanded(false);
    clearExpandedDom(bodyRef.current, rootRef?.current ?? null);
  }, [collapseKey, bodyRef, rootRef]);

  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el || !collapsible) {
      setOverflows(false);
      return;
    }
    const hasContent =
      (el.textContent ?? "").trim().length > 0 ||
      Boolean(el.querySelector("img, video, audio, a.task-inline-file, table, ul, ol"));
    if (!hasContent) {
      setOverflows(false);
      return;
    }
    setOverflows(contentOverflowsLines(el, COLLAPSED_TEXT_LINES));
  }, [collapsible, bodyRef]);

  useEffect(() => {
    measure();
  }, [measure, watchContent, collapseKey, expanded]);

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

  const finalizeExpandedHeight = useCallback(() => {
    const el = bodyRef.current;
    if (!el || !expanded) return;
    const fullHeight = measureExpandedHeight(el);
    el.style.minHeight = `${fullHeight}px`;
    el.style.height = `${fullHeight}px`;
    el.style.overflow = "hidden";
  }, [bodyRef, expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const el = bodyRef.current;
    if (!el) return;
    if (el.dataset.collapsibleExpanded !== "true") {
      applyExpandedDom(el, { lineClamp, rootEl: rootRef?.current ?? null });
    }
    finalizeExpandedHeight();
    onExpandRef.current?.();
  }, [expanded, watchContent, lineClamp, rootRef, finalizeExpandedHeight]);

  const expand = useCallback(() => {
    const el = bodyRef.current;
    if (el) {
      applyExpandedDom(el, { lineClamp, rootEl: rootRef?.current ?? null });
    }
    flushSync(() => setExpanded(true));
  }, [bodyRef, lineClamp, rootRef]);

  const showMore = collapsible && overflows && !expanded;

  const isOpen = expanded || unlockCollapsed;

  const bodyClampClass = collapsible
    ? isOpen
      ? "is-expanded collapsible-lines-5"
      : `is-collapsed collapsible-lines-5${lineClamp ? " collapsible-lines-5-clamp" : ""}`
    : "";

  return {
    expanded,
    expand,
    showMore,
    bodyClampClass,
  };
}
