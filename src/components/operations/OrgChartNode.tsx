import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  ORG_NODE_DEPARTMENT_HINT,
  resolveOrgChartPerson,
} from "../../utils/orgChartPersonMatch";
import { OrgChartPersonLink, OrgChartPersonList } from "./OrgChartPersonLink";
import { useOrgChartPeople } from "./OrgChartPeopleContext";
import { PersonAvatar } from "../PersonAvatar";

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
  role?: string;
};

export type OrgChartNodeData = {
  variant: "board" | "leader" | "department";
  title: string;
  subtitle?: string;
  name?: string;
  accent?: OrgChartAccent;
  members?: OrgChartMember[];
  boardNames?: boolean;
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

  if (data.variant === "board") {
    return (
      <div
        className={`${NODE_SHELL} w-[min(340px,85vw)] overflow-hidden rounded-xl bg-white shadow-md ring-1 ${accent.ring} transition-shadow hover:shadow-lg`}
      >
        <Handle type="target" position={Position.Top} className="!border-0 !bg-transparent !opacity-0" />
        <div className={`px-4 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide ${accent.header}`}>
          {data.title}
        </div>
        <p className="px-4 py-3 text-center text-xs font-medium leading-relaxed text-slate-700">
          {data.boardNames && data.subtitle ? (
            <OrgChartPersonList text={data.subtitle} matchContext={matchContext} className="text-xs" />
          ) : (
            data.subtitle
          )}
        </p>
        <Handle type="source" position={Position.Bottom} className="!border-0 !bg-transparent !opacity-0" />
      </div>
    );
  }

  if (data.variant === "leader") {
    const person = data.name ? resolveOrgChartPerson(data.name, people, matchContext) : undefined;
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
                  <li
                    key={`${member.name}-${member.role ?? ""}`}
                    className="border-t border-slate-100 pt-2 first:border-0 first:pt-0"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                        {memberPerson ? (
                          <PersonAvatar person={memberPerson} size="xs" />
                        ) : (
                          <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <OrgChartPersonLink label={member.name} person={memberPerson} className="text-sm" />
                        {member.role ? (
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{member.role}</p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : data.name ? (
            <OrgChartPersonLink
              label={data.name}
              person={person}
              showAvatar={Boolean(person)}
              className="mx-auto text-sm"
            />
          ) : null}
          {data.subtitle && memberRows.length === 0 ? (
            <p className="text-xs text-slate-600">{data.subtitle}</p>
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
            <li key={`${member.name}-${member.role ?? ""}`} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
              <div className="flex items-start gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  {memberPerson ? (
                    <PersonAvatar person={memberPerson} size="xs" />
                  ) : (
                    <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <OrgChartPersonLink label={member.name} person={memberPerson} className="text-xs" />
                  {member.role ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{member.role}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Handle type="source" position={Position.Bottom} className="!border-0 !bg-transparent !opacity-0" />
    </div>
  );
}

export const OrgChartNode = memo(OrgChartNodeInner);
