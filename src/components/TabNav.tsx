import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useT } from "../contexts/I18nContext";
import type { TabId } from "../types";

/** Primary sections in the header strip — calendar is a separate icon near notifications. */
const PRIMARY_TAB_IDS: TabId[] = [
  "tasks",
  "projects",
  "appointments",
  "team",
  "operations",
  "contacts",
  "reminders",
  "research",
];

function useVisibleTabs(showContactsTab: boolean, showResearchTab: boolean) {
  const t = useT();
  return useMemo(() => {
    const tabs = PRIMARY_TAB_IDS.map((id) => ({
      id,
      label: t(`nav.${id}`),
      title: t(`nav.${id}Title`),
    }));
    return tabs.filter((tab) => {
      if (tab.id === "contacts" && !showContactsTab) return false;
      if (tab.id === "research" && !showResearchTab) return false;
      return true;
    });
  }, [showContactsTab, showResearchTab, t]);
}

export function TabNav({
  active,
  onChange,
  showContactsTab = true,
  showResearchTab = false,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  /** Founders and Sales department partners. */
  showContactsTab?: boolean;
  /** Founders only. */
  showResearchTab?: boolean;
}) {
  const t = useT();
  const visibleTabs = useVisibleTabs(showContactsTab, showResearchTab);

  return (
    <nav className="segment-track w-max max-w-none shrink-0" aria-label={t("nav.ariaPrimary")}>
      {visibleTabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            title={tab.title}
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 text-[11px] font-semibold leading-none transition sm:min-h-9 sm:px-3 sm:text-sm ${
              isActive ? "segment-tab-active" : "segment-tab-inactive bg-transparent shadow-none"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Compact calendar entry — sits next to notifications so the tab strip does not clip. */
export function CalendarHeaderButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("nav.calendarTitle")}
      aria-label={t("nav.calendar")}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg border p-1.5 transition ${
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
    </button>
  );
}

/** Compact section picker for narrow viewports — keeps the header on one row. */
export function TabNavMenu({
  active,
  onChange,
  showContactsTab = true,
  showResearchTab = false,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  showContactsTab?: boolean;
  showResearchTab?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleTabs = useVisibleTabs(showContactsTab, showResearchTab);
  const activeTab =
    active === "calendar"
      ? { id: "calendar" as TabId, label: t("nav.calendar"), title: t("nav.calendarTitle") }
      : visibleTabs.find((tab) => tab.id === active) ?? visibleTabs[0];

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
        className="segment-tab-active inline-flex max-w-[min(11rem,calc(100vw-11rem))] min-h-8 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold sm:max-w-[14rem] sm:px-3 sm:text-sm"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("nav.ariaPrimary")}
      >
        <span className="truncate">{activeTab?.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-[calc(100%+6px)] z-50 max-h-[min(70vh,20rem)] min-w-[12rem] -translate-x-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="menuitem"
              title={tab.title}
              onClick={() => {
                onChange(tab.id);
                setOpen(false);
              }}
              className={`flex w-full px-3 py-2.5 text-left text-sm ${
                tab.id === active
                  ? "bg-indigo-50 font-semibold text-indigo-900"
                  : "font-medium text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
