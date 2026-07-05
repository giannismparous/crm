import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  ORG_NODE_DEPARTMENT_HINT,
  orgChartPersonDescription,
  resolveOrgChartPerson,
} from "../../utils/orgChartPersonMatch";
import { OrgChartPersonLink } from "./OrgChartPersonLink";
import { OrgChartMemberRow } from "./OrgChartMemberRow";
import { OrgChartFoundersBadge } from "./OrgChartFoundersBadge";
import { OrgChartAvatar, ORG_CHART_ICON_BOX } from "./OrgChartAvatar";
import { useOrgChartPeople } from "./OrgChartPeopleContext";

export type OrgChartAccent =
  | "indigo"
  | "teal"
  | "violet"
  | "amber"
  | "fuchsia"
  | "rose"
  | "sky"
  | "slate";

export type OrgChartMember = {
  name: string;
};

export type OrgChartNodeData = {
  variant: "founders" | "leader" | "department";
  title: string;
  subtitle?: string;
  name?: string;
  accent?: OrgChartAccent;
  members?: OrgChartMember[];
  preferFounder?: boolean;
};

const NODE_SHELL = "pointer-events-auto";

const ACCENT: Record<
  OrgChartAccent,
  { header: string; ring: string; dot: string }
> = {
  indigo: {
    header: "bg-indigo-600 text-white",
    ring: "ring-indigo-200/80",
    dot: "bg-indigo-500",
  },
  teal: {
    header: "bg-teal-600 text-white",
    ring: "ring-teal-200/80",
    dot: "bg-teal-500",
  },
  violet: {
    header: "bg-violet-600 text-white",
    ring: "ring-violet-200/80",
    dot: "bg-violet-500",
  },
  amber: {
    header: "bg-amber-500 text-amber-950",
    ring: "ring-amber-200/80",
    dot: "bg-amber-500",
  },
  fuchsia: {
    header: "bg-fuchsia-600 text-white",
    ring: "ring-fuchsia-200/80",
    dot: "bg-fuchsia-500",
  },
  rose: {
    header: "bg-rose-600 text-white",
    ring: "ring-rose-200/80",
    dot: "bg-rose-500",
  },
  sky: {
    header: "bg-sky-600 text-white",
    ring: "ring-sky-200/80",
    dot: "bg-sky-500",
  },
  slate: {
    header: "bg-slate-700 text-white",
    ring: "ring-slate-200/80",
    dot: "bg-slate-500",
  },
};

function OrgChartNodeInner({ id, data }: NodeProps<Node<OrgChartNodeData>>) {
  const { people } = useOrgChartPeople();
  const accent = ACCENT[data.accent ?? "slate"];
  const matchContext = {
    departmentHint: ORG_NODE_DEPARTMENT_HINT[id],
    preferFounder: data.preferFounder ?? (id === "ceo" || id === "founders"),
  };

  if (data.variant === "founders") {
    return (
      <div
        className={`${NODE_SHELL} w-[min(200px,70vw)] overflow-hidden rounded-2xl bg-white shadow-md ring-1 ${accent.ring} transition-shadow hover:shadow-lg`}
      >
        <Handle type="target" position={Position.Top} className="!border-0 !bg-transparent !opacity-0" />
        <OrgChartFoundersBadge members={data.members ?? []} matchContext={matchContext} />
        <Handle type="source" position={Position.Bottom} className="!border-0 !bg-transparent !opacity-0" />
      </div>
    );
  }

  if (data.variant === "leader") {
    const person = data.name ? resolveOrgChartPerson(data.name, people, matchContext) : undefined;
    const ceoDescription = orgChartPersonDescription(person);
    const memberRows = data.members ?? [];

    return (
      <div
        className={`${NODE_SHELL} w-[min(280px,80vw)] overflow-hidden rounded-xl bg-white shadow-md ring-1 ${accent.ring} transition-shadow hover:shadow-lg`}
      >
        <Handle type="target" position={Position.Top} className="!border-0 !bg-transparent !opacity-0" />
        <div className={`px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider ${accent.header}`}>
          {data.title}
        </div>
        <div className="space-y-1 px-4 py-3 text-center">
          {memberRows.length > 0 ? (
            <ul className="space-y-2.5 text-left">
              {memberRows.map((member) => {
                const memberPerson = resolveOrgChartPerson(member.name, people, {
                  ...matchContext,
                  preferFounder: matchContext.preferFounder ?? true,
                });
                return (
                  <li key={member.name} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                    <OrgChartMemberRow
                      label={member.name}
                      person={memberPerson}
                      dotClass={accent.dot}
                      nameClass="text-sm"
                    />
                  </li>
                );
              })}
            </ul>
          ) : data.name ? (
            <div className="flex flex-col items-center gap-1.5 text-center">
              {person ? (
                <div className={`flex items-center justify-center ${ORG_CHART_ICON_BOX.sm}`}>
                  <OrgChartAvatar person={person} size="sm" />
                </div>
              ) : null}
              <OrgChartPersonLink label={data.name} person={person} className="text-sm" />
              {ceoDescription ? <p className="text-xs leading-snug text-slate-600">{ceoDescription}</p> : null}
            </div>
          ) : null}
        </div>
        <Handle type="source" position={Position.Bottom} className="!border-0 !bg-transparent !opacity-0" />
      </div>
    );
  }

  return (
    <div
      className={`${NODE_SHELL} w-[min(220px,78vw)] overflow-hidden rounded-xl bg-white shadow-md ring-1 ${accent.ring} transition-shadow hover:shadow-lg`}
    >
      <Handle type="target" position={Position.Top} className="!border-0 !bg-transparent !opacity-0" />
      <div className={`px-3 py-2 text-center text-[10px] font-bold leading-snug ${accent.header}`}>{data.title}</div>
      <ul className="space-y-2 px-3 py-3">
        {(data.members ?? []).map((member) => {
          const memberPerson = resolveOrgChartPerson(member.name, people, matchContext);

          return (
            <li key={member.name} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
              <OrgChartMemberRow label={member.name} person={memberPerson} dotClass={accent.dot} />
            </li>
          );
        })}
      </ul>
      <Handle type="source" position={Position.Bottom} className="!border-0 !bg-transparent !opacity-0" />
    </div>
  );
}

export const OrgChartNode = memo(OrgChartNodeInner);
