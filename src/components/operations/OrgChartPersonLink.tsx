import type { MouseEvent, KeyboardEvent, PointerEvent } from "react";
import type { Person } from "../../types";
import { useT } from "../../contexts/I18nContext";
import { isKeyboardComposing } from "../../utils/keyboardComposition";
import {
  orgChartDisplayLabel,
  resolveOrgChartPerson,
  splitOrgChartNameList,
  type OrgChartMatchContext,
} from "../../utils/orgChartPersonMatch";
import { PersonAvatar } from "../PersonAvatar";
import { useOrgChartPeople } from "./OrgChartPeopleContext";

function stopFlow(e: MouseEvent | PointerEvent) {
  e.stopPropagation();
}

export function OrgChartPersonLink({
  label,
  person,
  className = "",
  showAvatar = false,
}: {
  label: string;
  person?: Person;
  className?: string;
  showAvatar?: boolean;
}) {
  const t = useT();
  const { onOpenPerson } = useOrgChartPeople();

  if (!person?.id) {
    return <span className={className}>{label}</span>;
  }

  const displayLabel = orgChartDisplayLabel(label, person);

  const open = (e: MouseEvent | KeyboardEvent) => {
    stopFlow(e as MouseEvent);
    onOpenPerson(person.id);
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
      onPointerDown={stopFlow}
      onClick={open}
      onKeyDown={onKeyDown}
      title={t("team.viewMember", { name: person.name })}
      className={`nodrag nopan nowheel cursor-pointer inline-flex max-w-full items-center gap-1.5 rounded-md text-left font-semibold text-accent underline decoration-accent/35 underline-offset-2 transition hover:bg-accent/5 hover:text-accent-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${className}`.trim()}
    >
      {showAvatar ? <PersonAvatar person={person} size="2xs" /> : null}
      <span className="truncate">{displayLabel}</span>
    </button>
  );
}

export function OrgChartPersonList({
  text,
  matchContext = {},
  className = "",
}: {
  text: string;
  matchContext?: OrgChartMatchContext;
  className?: string;
}) {
  const { people } = useOrgChartPeople();
  const labels = splitOrgChartNameList(text);

  if (labels.length <= 1) {
    const person = resolveOrgChartPerson(text.trim(), people, matchContext);
    if (person) {
      return (
        <OrgChartPersonLink label={text.trim()} person={person} className={className} showAvatar />
      );
    }
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={`inline-flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 ${className}`}>
      {labels.map((label, index) => {
        const person = resolveOrgChartPerson(label, people, matchContext);
        return (
          <span key={`${label}-${index}`} className="inline-flex items-center">
            {index > 0 ? <span className="mx-0.5 text-slate-400">·</span> : null}
            <OrgChartPersonLink label={label} person={person} showAvatar={Boolean(person)} />
          </span>
        );
      })}
    </span>
  );
}
