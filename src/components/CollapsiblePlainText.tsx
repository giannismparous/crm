import { useRef } from "react";
import { useOneWayCollapsible } from "../hooks/useOneWayCollapsible";
import { CollapsibleExpandToggle } from "./CollapsibleExpandToggle";

export function CollapsiblePlainText({
  text,
  collapseKey,
}: {
  text: string;
  collapseKey?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { bodyClampClass, expand, showMore, expanded } = useOneWayCollapsible(
    collapseKey,
    text,
    true,
    ref,
    undefined,
    { lineClamp: true, rootRef }
  );

  return (
    <div
      ref={rootRef}
      className={`${expanded ? "overflow-visible" : "overflow-hidden"} rounded-xl border border-slate-200 bg-slate-50/80`}
    >
      <p
        ref={ref}
        className={`whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed text-slate-700 ${bodyClampClass}`}
      >
        {text}
      </p>
      <CollapsibleExpandToggle show={showMore} onExpand={expand} />
    </div>
  );
}
