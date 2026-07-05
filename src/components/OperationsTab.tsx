import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Person } from "../types";
import { useOpenTeamMember } from "../contexts/PersonNavContext";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import { useT } from "../contexts/I18nContext";
import { ContentLoadingPanel } from "./ContentLoadingPanel";
import { OperationsOrgChart } from "./operations/OperationsOrgChart";

const StrategicPlanDocument = lazy(() =>
  import("./operations/StrategicPlanDocument").then((m) => ({ default: m.StrategicPlanDocument }))
);

export type OperationsView = "orgChart" | "strategicPlan";

const OPERATIONS_VIEW_DEFAULTS = { view: "orgChart" as OperationsView };

export function OperationsTab({
  people,
  currentUserId,
  canAccessStrategicPlan,
}: {
  people: Person[];
  currentUserId: string;
  canAccessStrategicPlan: boolean;
}) {
  const t = useT();
  const openTeamMember = useOpenTeamMember();
  const isFounder = canAccessStrategicPlan;
  const saved = useMemo(() => readPersistedTabState("operations", OPERATIONS_VIEW_DEFAULTS), []);
  const [view, setView] = useState<OperationsView>(() =>
    isFounder && saved.view === "strategicPlan" ? "strategicPlan" : "orgChart"
  );

  useEffect(() => {
    if (!isFounder && view === "strategicPlan") setView("orgChart");
  }, [isFounder, view]);

  usePersistedTabState("operations", { view: isFounder ? view : "orgChart" });

  const activeView = isFounder && view === "strategicPlan" ? "strategicPlan" : "orgChart";

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4">
      {isFounder ? (
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
          currentUserId={currentUserId}
          onOpenPerson={(personId) => openTeamMember?.(personId)}
        />
      ) : isFounder ? (
        <Suspense fallback={<ContentLoadingPanel minHeightClass="min-h-[24rem] py-16" />}>
          <StrategicPlanDocument isFounder={isFounder} />
        </Suspense>
      ) : null}
    </div>
  );
}
