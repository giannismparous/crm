import type { MouseEvent, KeyboardEvent } from "react";
import { Crown } from "lucide-react";
import { useT } from "../../contexts/I18nContext";
import { isKeyboardComposing } from "../../utils/keyboardComposition";
import { resolveOrgChartPerson, type OrgChartMatchContext } from "../../utils/orgChartPersonMatch";
import type { OrgChartMember } from "./OrgChartNode";
import { OrgChartAvatar, ORG_CHART_ICON_BOX } from "./OrgChartAvatar";
import { useOrgChartPeople } from "./OrgChartPeopleContext";

function stopFlow(e: MouseEvent) {
  e.stopPropagation();
}

export function OrgChartFoundersBadge({
  members,
  matchContext,
}: {
  members: OrgChartMember[];
  matchContext: OrgChartMatchContext;
}) {
  const t = useT();
  const { people, onOpenPerson } = useOrgChartPeople();
  const founderContext = { ...matchContext, preferFounder: true };

  const rows = members
    .map((member) => ({
      member,
      person: resolveOrgChartPerson(member.name, people, founderContext),
    }))
    .filter((row) => row.person?.id);

  return (
    <div className="flex flex-col items-center gap-2.5 px-3 py-3">
      <div
        className="flex items-center justify-center gap-1.5 text-indigo-800"
        title={t("operations.foundersBadgeTitle")}
      >
        <span className={`flex shrink-0 items-center justify-center rounded-full bg-indigo-100 ring-1 ring-indigo-200/90 ${ORG_CHART_ICON_BOX.sm}`}>
          <Crown className="h-4 w-4 shrink-0 text-indigo-600" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-[10px] font-bold uppercase leading-none tracking-wider">
          {t("operations.foundersBadge")}
        </span>
      </div>
      <div className="flex items-center justify-center">
        {rows.map(({ member, person }, index) => {
          const open = (e: MouseEvent | KeyboardEvent) => {
            stopFlow(e as MouseEvent);
            if (person?.id) onOpenPerson(person.id);
          };
          const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
            if (isKeyboardComposing(e)) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              open(e);
            }
          };

          return (
            <button
              key={person!.id}
              type="button"
              title={t("team.viewMember", { name: person!.name })}
              onPointerDown={stopFlow}
              onClick={open}
              onKeyDown={onKeyDown}
              className={`nodrag nopan nowheel relative flex shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-white transition hover:z-20 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${ORG_CHART_ICON_BOX.sm} ${
                index > 0 ? "-ml-2" : ""
              }`}
              style={{ zIndex: rows.length - index }}
            >
              <OrgChartAvatar person={person} size="sm" />
              <span className="sr-only">{member.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
