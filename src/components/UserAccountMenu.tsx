import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { signOutUser } from "../firebase/config";

export function UserAccountMenu({
  name,
  email,
  canOpenSettings,
  onOpenSettings,
}: {
  name: string;
  email?: string | null;
  canOpenSettings: boolean;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[7rem] items-center gap-0.5 rounded-lg border border-slate-200/80 bg-white/60 px-2 py-1 hover:bg-slate-50 sm:max-w-[10rem] sm:gap-1"
        aria-expanded={open}
        aria-haspopup="menu"
        title={email ?? name}
      >
        <span className="truncate text-[10px] font-semibold text-indigo-700 sm:text-xs">{name}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[11rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          {email && (
            <p className="border-b border-slate-100 px-3 py-2 text-[10px] leading-snug text-slate-500">{email}</p>
          )}
          {canOpenSettings && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              <Settings className="h-3.5 w-3.5 text-slate-500" aria-hidden />
              Settings
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOutUser()}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-50"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
