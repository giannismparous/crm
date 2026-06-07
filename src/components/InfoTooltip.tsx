import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

export function InfoTooltip({
  text,
  label,
  className = "",
  iconClassName = "h-4 w-4",
}: {
  text: string;
  label: string;
  className?: string;
  iconClassName?: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTip({ top: rect.bottom + 6, left: rect.left });
  }

  return (
    <>
      <span
        ref={anchorRef}
        className={`inline-flex shrink-0 cursor-pointer select-none ${className}`}
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
        onFocus={show}
        onBlur={() => setTip(null)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Info
          className={`${iconClassName} text-slate-400 transition-colors hover:text-slate-600`}
          aria-label={label}
        />
      </span>
      {tip
        ? createPortal(
            <span
              role="tooltip"
              style={{ position: "fixed", top: tip.top, left: tip.left }}
              className="pointer-events-none z-[9999] w-52 rounded-lg bg-slate-900 px-2.5 py-2 text-[10px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
            >
              {text}
            </span>,
            document.body
          )
        : null}
    </>
  );
}
