import { useRef, useState } from "react";
import {
  applyEditingDom,
  applyExpandedDom,
  COLLAPSED_TEXT_LINES,
  contentOverflowsLines,
  expandedRowsForText,
  useOneWayCollapsible,
} from "../hooks/useOneWayCollapsible";
import { CollapsibleExpandToggle } from "./CollapsibleExpandToggle";

export function CollapsibleTextarea({
  value,
  onChange,
  collapseKey,
  placeholder = "Add a description…",
}: {
  value: string;
  onChange: (value: string) => void;
  collapseKey?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const { bodyClampClass, expand, showMore, expanded } = useOneWayCollapsible(
    collapseKey,
    value,
    true,
    ref,
    undefined,
    { unlockCollapsed: editing, rootRef }
  );

  const clipCollapsed = !expanded && !editing;
  const rows = clipCollapsed ? COLLAPSED_TEXT_LINES : expandedRowsForText(value);

  return (
    <div
      ref={rootRef}
      className={`collapsible-textarea-root ${clipCollapsed ? "overflow-hidden" : "overflow-visible"} rounded-xl border border-slate-200 bg-slate-50/80`}
    >
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          const el = ref.current;
          if (el && contentOverflowsLines(el, COLLAPSED_TEXT_LINES)) expand();
        }}
        onFocus={() => {
          setEditing(true);
          expand();
          const el = ref.current;
          if (el) applyEditingDom(el, rootRef.current);
        }}
        onBlur={() => {
          setEditing(false);
          const el = ref.current;
          if (el && expanded) {
            applyExpandedDom(el, { rootEl: rootRef.current });
          }
        }}
        className={`collapsible-textarea w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-relaxed text-slate-700 outline-none placeholder:text-slate-400 ${bodyClampClass} ${editing ? "is-editing" : ""}`}
      />
      <CollapsibleExpandToggle show={showMore} onExpand={expand} />
    </div>
  );
}
