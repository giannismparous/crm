import { useMemo } from "react";
import { useT } from "../contexts/I18nContext";
import type { TabId } from "../types";

const TAB_IDS: TabId[] = ["tasks", "projects", "appointments", "team", "contacts", "reminders", "calendar"];

export function TabNav({
  active,
  onChange,
  seesAllOrgData = true,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  seesAllOrgData?: boolean;
}) {
  const t = useT();
  const tabs = useMemo(
    () =>
      TAB_IDS.map((id) => ({
        id,
        label: t(`nav.${id}`),
        title: t(`nav.${id}Title`),
      })),
    [t]
  );

  const visibleTabs = useMemo(
    () => (seesAllOrgData ? tabs : tabs.filter((tab) => tab.id !== "contacts")),
    [seesAllOrgData, tabs]
  );

  return (
    <nav className="segment-track shrink-0" aria-label={t("nav.ariaPrimary")}>
      {visibleTabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            title={tab.title}
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-xs font-semibold leading-none transition sm:min-h-9 sm:px-3 sm:text-sm ${
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
