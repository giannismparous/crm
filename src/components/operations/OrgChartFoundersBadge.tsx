import type { MouseEvent, KeyboardEvent } from "react";
import { Crown } from "lucide-react";
import { useT } from "../../contexts/I18nContext";
import { isKeyboardComposing } from "../../utils/keyboardComposition";
import { resolveOrgChartPerson, type OrgChartMatchContext } from "../../utils/orgChartPersonMatch";
import { PersonAvatar } from "../PersonAvatar";
import type { OrgChartMember } from "./OrgChartNode";
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
    <div className="flex flex-col items-center gap-2 px-2 py-2.5">
      <div
        className="flex items-center gap-1.5 text-indigo-800"
        title={t("operations.foundersBadgeTitle")}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 ring-1 ring-indigo-200/90">
          <Crown className="h-3.5 w-3.5 text-indigo-600" strokeWidth={2.25} aria-hidden />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider">{t("operations.foundersBadge")}</span>
      </div>
      <div className="flex items-center justify-center pl-1">
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
              className={`nodrag nopan nowheel relative rounded-full transition hover:z-20 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${
                index > 0 ? "-ml-2.5" : ""
              }`}
              style={{ zIndex: rows.length - index }}
            >
              <PersonAvatar person={person} size="sm" className="ring-2 ring-white shadow-sm" />
              <span className="sr-only">{member.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
