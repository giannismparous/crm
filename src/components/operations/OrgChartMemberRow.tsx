import type { Person } from "../../types";
import { orgChartPersonDescription } from "../../utils/orgChartPersonMatch";
import { OrgChartAvatar, ORG_CHART_ICON_BOX } from "./OrgChartAvatar";
import { OrgChartPersonLink } from "./OrgChartPersonLink";

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

  return (
    <div className={`flex gap-2.5 ${alignStart ? "items-start" : "items-center"}`}>
      <div
        className={`flex shrink-0 items-center justify-center ${ORG_CHART_ICON_BOX.xs} ${
          alignStart ? "pt-0.5" : ""
        }`}
      >
        {person ? (
          <OrgChartAvatar person={person} size="xs" />
        ) : (
          <span className={`block h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <OrgChartPersonLink label={label} person={person} className={nameClass} />
        {description ? (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
