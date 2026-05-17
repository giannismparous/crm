import type { TabId } from "../types";

const tabs: { id: TabId; label: string; title: string }[] = [
  { id: "tasks", label: "Tasks", title: "Team tasks — assign and track work" },
  { id: "team", label: "Team", title: "Team directory — departments and members" },
  { id: "contacts", label: "Contacts", title: "Sales contacts — notes and reminders" },
  { id: "calendar", label: "Calendar", title: "Month view — tasks and reminders by day" },
];

export function TabNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <nav
      className="inline-flex rounded-lg border border-slate-200/90 bg-slate-100/90 p-0.5 shadow-inner"
      aria-label="Primary"
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            title={t.title}
            onClick={() => onChange(t.id)}
            className={`relative rounded-md px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 sm:text-sm ${
              isActive
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
