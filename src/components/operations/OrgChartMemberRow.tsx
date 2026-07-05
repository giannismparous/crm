import type { Person } from "../../types";
import { orgChartPersonDescription } from "../../utils/orgChartPersonMatch";
import { OrgChartPersonLink } from "./OrgChartPersonLink";
import { PersonAvatar } from "../PersonAvatar";

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

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        {person ? (
          <PersonAvatar person={person} size="xs" />
        ) : (
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <OrgChartPersonLink label={label} person={person} className={nameClass} />
        {description ? (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
