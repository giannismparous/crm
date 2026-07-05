import { orgChartPersonDescription } from "../../utils/orgChartPersonMatch";
import { OrgChartAvatar, ORG_CHART_ICON_BOX } from "./OrgChartAvatar";
import { OrgChartPersonLink } from "./OrgChartPersonLink";
import { useOrgChartIsYou } from "./OrgChartPeopleContext";
import type { Person } from "../../types";

export function OrgChartMemberRow({
  label,
  person,
  dotClass,
  nameClass = "text-xs",
}: {
  label: string;
  person?: Person;
  dotClass: string;
  nameClass?: string;
}) {
  const description = orgChartPersonDescription(person);
  const alignStart = Boolean(description);
  const isYou = useOrgChartIsYou(person);

  return (
    <div
      className={`flex gap-2.5 rounded-lg transition-colors duration-300 ease-out ${isYou ? "bg-accent/10 px-2 py-1.5 ring-1 ring-accent/30" : ""} ${
        alignStart ? "items-start" : "items-center"
      }`}
    >
      <div
        className={`flex shrink-0 items-center justify-center ${ORG_CHART_ICON_BOX.xs} ${
          alignStart ? "pt-0.5" : ""
        }`}
      >
        {person ? (
          <OrgChartAvatar person={person} size="xs" highlight={isYou} />
        ) : (
          <span className={`block h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <OrgChartPersonLink
            label={label}
            person={person}
            className={`${nameClass} ${isYou ? "!text-slate-900" : ""}`}
            emphasize={isYou}
          />
        </div>
        {description ? (
          <p className={`mt-0.5 text-[11px] leading-snug ${isYou ? "text-slate-700" : "text-slate-600"}`}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
