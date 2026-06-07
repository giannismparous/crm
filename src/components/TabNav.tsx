import { useMemo } from "react";
import type { TabId } from "../types";

const tabs: { id: TabId; label: string; title: string }[] = [
  { id: "tasks", label: "Tasks", title: "Team tasks — assign and track work" },
  { id: "projects", label: "Projects", title: "Projects — group tasks by initiative" },
  { id: "appointments", label: "Appointments", title: "Appointments — schedule meetings for yourself or others" },
  { id: "team", label: "Team", title: "Team directory — departments and members" },
  { id: "contacts", label: "Contacts", title: "Sales contacts — notes and reminders" },
  { id: "reminders", label: "Reminders", title: "Personal reminders — yours, with optional links" },
  { id: "calendar", label: "Calendar", title: "Month view — appointments, tasks, and reminders" },
];

export function TabNav({
  active,
  onChange,
  seesAllOrgData = true,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  seesAllOrgData?: boolean;
}) {
  const visibleTabs = useMemo(
    () => (seesAllOrgData ? tabs : tabs.filter((t) => t.id !== "contacts")),
    [seesAllOrgData]
  );

  return (
    <nav
      className="segment-track shrink-0"
      aria-label="Primary"
    >
      {visibleTabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            title={t.title}
            onClick={() => onChange(t.id)}
            className={`inline-flex min-h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-xs font-semibold leading-none transition sm:min-h-9 sm:px-3 sm:text-sm ${
              isActive ? "segment-tab-active" : "segment-tab-inactive bg-transparent shadow-none"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
