import { useMemo, useState } from "react";
import type { Person } from "../types";
import { useOpenTeamMember } from "../contexts/PersonNavContext";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import { useT } from "../contexts/I18nContext";
import { OperationsOrgChart } from "./operations/OperationsOrgChart";
import { StrategicPlanDocument } from "./operations/StrategicPlanDocument";

export type OperationsView = "orgChart" | "strategicPlan";

const OPERATIONS_VIEW_DEFAULTS = { view: "orgChart" as OperationsView };

export function OperationsTab({
  people,
  canAccessStrategicPlan,
}: {
  people: Person[];
  canAccessStrategicPlan: boolean;
}) {
  const t = useT();
  const openTeamMember = useOpenTeamMember();
  const saved = useMemo(() => readPersistedTabState("operations", OPERATIONS_VIEW_DEFAULTS), []);
  const [view, setView] = useState<OperationsView>(() =>
    canAccessStrategicPlan && saved.view === "strategicPlan" ? "strategicPlan" : "orgChart"
  );

  usePersistedTabState("operations", { view: canAccessStrategicPlan ? view : "orgChart" });

  const activeView = canAccessStrategicPlan ? view : "orgChart";

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4">
      {canAccessStrategicPlan ? (
        <nav className="segment-track w-max max-w-full" aria-label={t("operations.viewAria")}>
          <button
            type="button"
            onClick={() => setView("orgChart")}
            className={`inline-flex min-h-8 items-center rounded-md px-3 text-sm font-semibold transition ${
              activeView === "orgChart" ? "segment-tab-active" : "segment-tab-inactive bg-transparent shadow-none"
            }`}
          >
            {t("operations.viewOrgChart")}
          </button>
          <button
            type="button"
            onClick={() => setView("strategicPlan")}
            className={`inline-flex min-h-8 items-center rounded-md px-3 text-sm font-semibold transition ${
              activeView === "strategicPlan"
                ? "segment-tab-active"
                : "segment-tab-inactive bg-transparent shadow-none"
            }`}
          >
            {t("operations.viewStrategicPlan")}
          </button>
        </nav>
      ) : null}

      {activeView === "orgChart" ? (
        <OperationsOrgChart
          people={people}
          onOpenPerson={(personId) => openTeamMember?.(personId)}
        />
      ) : (
        <StrategicPlanDocument />
      )}
    </div>
  );
}
