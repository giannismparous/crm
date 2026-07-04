import { useEffect, useMemo, useState } from "react";
import type { Project } from "../types";
import { useT } from "../contexts/I18nContext";

function ProjectSectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-slate-100/80"
    >
      <span
        className={`inline-block shrink-0 text-[10px] text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        aria-hidden
      >
        ▸
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</span>
      <span className="text-[10px] tabular-nums text-slate-400">{count}</span>
    </button>
  );
}

function ProjectOption({
  project,
  selected,
  onSelect,
}: {
  project: Project;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
        selected
          ? "border-indigo-300 bg-indigo-50/90 font-semibold text-slate-900 ring-1 ring-indigo-200"
          : project.completed
            ? "border-slate-200 bg-white text-slate-700 opacity-80 hover:border-slate-300 hover:bg-slate-50"
            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: project.color }}
        aria-hidden
      />
      <span className="min-w-0 truncate">{project.name}</span>
    </button>
  );
}

export function ProjectSelectField({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
}) {
  const t = useT();
  const openProjects = useMemo(
    () => projects.filter((p) => !p.completed).sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );
  const completedProjects = useMemo(
    () => projects.filter((p) => p.completed).sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );
  const [openExpanded, setOpenExpanded] = useState(true);
  const [completeExpanded, setCompleteExpanded] = useState(false);

  useEffect(() => {
    if (value && completedProjects.some((p) => p.id === value)) {
      setCompleteExpanded(true);
    }
  }, [value, completedProjects]);

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2">
      <button
        type="button"
        onClick={() => onChange("")}
        aria-pressed={!value}
        className={`flex w-full items-center rounded-lg border px-2.5 py-2 text-left text-sm transition ${
          !value
            ? "border-indigo-300 bg-indigo-50/90 font-semibold text-slate-900 ring-1 ring-indigo-200"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        {t("tasks.form.noProject")}
      </button>

      {openProjects.length > 0 && (
        <div>
          <ProjectSectionHeader
            title={t("projects.section.open")}
            count={openProjects.length}
            expanded={openExpanded}
            onToggle={() => setOpenExpanded((v) => !v)}
          />
          {openExpanded && (
            <ul className="mt-1 space-y-1 pl-1">
              {openProjects.map((p) => (
                <li key={p.id}>
                  <ProjectOption
                    project={p}
                    selected={value === p.id}
                    onSelect={() => onChange(value === p.id ? "" : p.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {completedProjects.length > 0 && (
        <div>
          <ProjectSectionHeader
            title={t("projects.section.complete")}
            count={completedProjects.length}
            expanded={completeExpanded}
            onToggle={() => setCompleteExpanded((v) => !v)}
          />
          {completeExpanded && (
            <ul className="mt-1 space-y-1 pl-1">
              {completedProjects.map((p) => (
                <li key={p.id}>
                  <ProjectOption
                    project={p}
                    selected={value === p.id}
                    onSelect={() => onChange(value === p.id ? "" : p.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
