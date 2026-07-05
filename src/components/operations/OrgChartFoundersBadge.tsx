import type { MouseEvent, KeyboardEvent } from "react";
import { Crown } from "lucide-react";
import { useT } from "../../contexts/I18nContext";
import { isKeyboardComposing } from "../../utils/keyboardComposition";
import { resolveOrgChartPerson, type OrgChartMatchContext } from "../../utils/orgChartPersonMatch";
import type { OrgChartMember } from "./OrgChartNode";
import { OrgChartAvatar, ORG_CHART_ICON_BOX } from "./OrgChartAvatar";
import { useOrgChartPeople, useOrgChartIsYou } from "./OrgChartPeopleContext";

function stopFlow(e: MouseEvent) {
  e.stopPropagation();
}

function founderInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function FoundersAvatarPlaceholder({ memberName, index }: { memberName: string; index: number }) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-700 ring-2 ring-white ${ORG_CHART_ICON_BOX.sm} ${
        index > 0 ? "-ml-2" : ""
      }`}
      title={memberName}
      aria-hidden
    >
      {founderInitials(memberName)}
    </span>
  );
}

function FoundersAvatarButton({
  person,
  memberName,
  index,
  zIndex,
  onOpen,
}: {
  person: NonNullable<ReturnType<typeof resolveOrgChartPerson>>;
  memberName: string;
  index: number;
  zIndex: number;
  onOpen: (personId: string) => void;
}) {
  const t = useT();
  const isYou = useOrgChartIsYou(person);

  const open = (e: MouseEvent | KeyboardEvent) => {
    stopFlow(e as MouseEvent);
    onOpen(person.id);
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
      type="button"
      title={t("team.viewMember", { name: person.name })}
      onPointerDown={stopFlow}
      onClick={open}
      onKeyDown={onKeyDown}
      className={`nodrag nopan nowheel relative flex shrink-0 items-center justify-center rounded-full bg-white transition hover:z-20 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${ORG_CHART_ICON_BOX.sm} ${
        isYou ? "ring-2 ring-accent ring-offset-1" : "ring-2 ring-white"
      } ${index > 0 ? "-ml-2" : ""}`}
      style={{ zIndex }}
    >
      <OrgChartAvatar person={person} size="sm" highlight={isYou} />
      <span className="sr-only">{memberName}</span>
    </button>
  );
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

  const rows = members.map((member) => ({
    member,
    person: resolveOrgChartPerson(member.name, people, founderContext),
  }));

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
        {rows.map(({ member, person }, index) =>
          person?.id ? (
            <FoundersAvatarButton
              key={person.id}
              person={person}
              memberName={member.name}
              index={index}
              zIndex={rows.length - index}
              onOpen={onOpenPerson}
            />
          ) : (
            <FoundersAvatarPlaceholder key={member.name} memberName={member.name} index={index} />
          )
        )}
      </div>
    </div>
  );
}
