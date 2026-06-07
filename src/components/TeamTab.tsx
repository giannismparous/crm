import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Person, PersonTaskStats } from "../types";
import { PersonAvatar } from "./PersonAvatar";
import { ProfilePhotoAvatar } from "./ProfilePhotoEditor";
import { EMPTY_PERSON_TASK_STATS, personStatsLabel } from "../utils/personTaskStats";
import { hasPrivilege, type OrgRole } from "../auth/roles";
import { OrgRoleWithInfo } from "./OrgRoleWithInfo";
import {
  TEAM_DEPARTMENTS,
  departmentChipClass,
  personDepartmentsLabel,
  personSortKey,
} from "../types";

function personMatchesSearch(p: Person, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${p.name} ${p.email} ${p.title} ${p.departments.join(" ")}`.toLowerCase().includes(s);
}

const DEPARTMENT_LIST: string[] = [...TEAM_DEPARTMENTS];

function allowedDepartments(depts: string[]): string[] {
  return depts.filter((d) => DEPARTMENT_LIST.includes(d));
}

function personInDepartment(p: Person, deptFilter: string): boolean {
  const valid = allowedDepartments(p.departments);
  if (deptFilter === "Unassigned") return valid.length === 0;
  return valid.includes(deptFilter);
}

export function TeamTab({
  people,
  currentUserId,
  currentUserOrgRole,
  onUpdatePerson,
}: {
  people: Person[];
  currentUserId: string;
  currentUserOrgRole: OrgRole;
  onUpdatePerson: (id: string, patch: Partial<Person>) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("");

  const sortedList = useMemo(() => {
    return [...people]
      .filter((p) => personMatchesSearch(p, query))
      .filter((p) => !deptFilter || personInDepartment(p, deptFilter))
      .sort((a, b) =>
        personSortKey(allowedDepartments(a.departments), a.name).localeCompare(
          personSortKey(allowedDepartments(b.departments), b.name)
        )
      );
  }, [people, query, deptFilter]);

  useEffect(() => {
    if (sortedList.length === 0) {
      setSelectedId("");
      return;
    }
    if (!sortedList.some((p) => p.id === selectedId)) {
      setSelectedId(sortedList[0]!.id);
    }
  }, [sortedList, selectedId]);

  const selected = useMemo(
    () => sortedList.find((p) => p.id === selectedId) ?? sortedList[0],
    [sortedList, selectedId]
  );

  const byDepartment = useMemo(() => {
    const counts = new Map<string, number>(DEPARTMENT_LIST.map((d) => [d, 0]));
    let unassigned = 0;
    for (const p of people) {
      const valid = allowedDepartments(p.departments);
      if (valid.length === 0) unassigned++;
      else for (const d of valid) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const rows = DEPARTMENT_LIST.map((d) => [d, counts.get(d) ?? 0] as const);
    if (unassigned > 0) rows.push(["Unassigned", unassigned]);
    return rows;
  }, [people]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
      <aside className="space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-900">Team</h2>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="input-base py-2 text-sm"
        />

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setDeptFilter("")}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition ${
              !deptFilter
                ? "bg-indigo-50 text-indigo-900 ring-indigo-200"
                : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            All ({people.length})
          </button>
          {byDepartment.map(([dept, count]) => (
            <button
              key={dept}
              type="button"
              onClick={() => setDeptFilter(deptFilter === dept ? "" : dept)}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition ${
                deptFilter === dept
                  ? departmentChipClass(dept)
                  : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {dept} ({count})
            </button>
          ))}
        </div>

        <ul className="space-y-1.5">
          {sortedList.map((p) => {
            const active = selected?.id === p.id;
            const isYou = p.id === currentUserId;
            const depts = allowedDepartments(p.departments);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-indigo-300 bg-indigo-50/90 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <PersonAvatar person={p} size="md" />
                    <div className="min-w-0 flex-1">
                      <OrgRoleWithInfo role={p.orgRole} size="xs" showInfo={false} />
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                        {p.name}
                        {isYou && (
                          <span className="ml-1 text-[10px] font-medium text-indigo-600">(you)</span>
                        )}
                      </p>
                      <DepartmentChips departments={depts} max={2} size="xs" />
                      <p className="mt-1 truncate text-xs text-slate-500">{p.title || "—"}</p>
                      <p className="truncate text-[10px] text-slate-400">{p.email}</p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {sortedList.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
            {people.length === 0
              ? "No registered users yet. Team members appear here after they sign up or sign in."
              : "No matches."}
          </p>
        )}
      </aside>

      {selected ? (
        <PersonDetail
          person={selected}
          isYou={selected.id === currentUserId}
          canEditDepartments={hasPrivilege(currentUserOrgRole, "manageOrgRoles")}
          onChange={(patch) => void onUpdatePerson(selected.id, patch).catch(console.error)}
        />
      ) : (
        <div className="glass-strong flex min-h-[320px] items-center justify-center rounded-3xl p-8 text-center text-slate-500">
          Select a team member to set their departments and title.
        </div>
      )}
    </div>
  );
}

function DepartmentChips({
  departments,
  max = 3,
  size = "sm",
}: {
  departments: string[];
  max?: number;
  size?: "xs" | "sm";
}) {
  if (departments.length === 0) {
    return (
      <span
        className={`mt-1 inline-block rounded-full px-1.5 py-0.5 font-semibold ring-1 ring-inset ${departmentChipClass("")} ${
          size === "xs" ? "text-[9px]" : "text-xs"
        }`}
      >
        Unassigned
      </span>
    );
  }
  const shown = departments.slice(0, max);
  const extra = departments.length - shown.length;
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-xs";
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map((d) => (
        <span
          key={d}
          className={`rounded-full font-semibold ring-1 ring-inset ${pad} ${departmentChipClass(d)}`}
        >
          {d}
        </span>
      ))}
      {extra > 0 && (
        <span className={`rounded-full bg-slate-100 font-medium text-slate-600 ring-1 ring-slate-200 ${pad}`}>
          +{extra}
        </span>
      )}
    </div>
  );
}

function DepartmentMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (departments: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = allowedDepartments(value);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function toggle(dept: string) {
    if (selected.includes(dept)) onChange(selected.filter((d) => d !== dept));
    else onChange([...selected, dept]);
  }

  const summary =
    selected.length === 0
      ? "Choose departments…"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} departments`;

  return (
    <div className="space-y-2">
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="input-base flex h-10 w-full items-center justify-between gap-2 rounded-xl py-0 pl-3 pr-2 text-left text-sm"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{summary}</span>
          <span className="shrink-0 text-slate-400" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <div
            className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[14rem] max-w-md rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black/5"
            role="listbox"
            aria-label="Departments"
          >
            <div className="max-h-48 overflow-y-auto text-sm">
              {DEPARTMENT_LIST.map((d) => (
                <label
                  key={d}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(d)}
                    onChange={() => toggle(d)}
                    className="rounded border-slate-300 text-accent focus:ring-accent/30"
                  />
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${departmentChipClass(d)}`}
                  >
                    {d}
                  </span>
                </label>
              ))}
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                className="mt-1.5 w-full rounded-md border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => onChange([])}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonDetail({
  person,
  isYou,
  canEditDepartments,
  onChange,
}: {
  person: Person;
  isYou: boolean;
  canEditDepartments: boolean;
  onChange: (patch: Partial<Person>) => void | Promise<void>;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="flex items-center gap-6 border-b border-slate-100 pb-6 sm:gap-8">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-1 sm:gap-1.5">
          <OrgRoleWithInfo role={person.orgRole} size="md" showInfo={false} />
          <h3 className="font-display text-3xl font-semibold leading-none text-slate-900 sm:text-4xl lg:text-5xl">
            {person.name}
            {isYou && (
              <span className="ml-2 text-xl font-medium text-indigo-600 sm:text-2xl lg:text-3xl">(you)</span>
            )}
          </h3>
          <p className="text-xl leading-tight text-slate-600 sm:text-2xl lg:text-3xl">{person.email}</p>
        </div>
        <ProfilePhotoAvatar
          person={person}
          onChange={onChange}
          editable={isYou}
          size="2xl"
          className="shadow-sm"
        />
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Labeled label="Display name">
          <input value={person.name} onChange={(e) => onChange({ name: e.target.value })} className="input-base" />
        </Labeled>
        <Labeled label="Title">
          <input
            value={person.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. Sales Lead"
            className="input-base"
          />
        </Labeled>
        <Labeled label="Email">
          <input type="email" value={person.email} readOnly className="input-base bg-slate-50 text-slate-600" />
        </Labeled>
        <Labeled label="Departments" className="sm:col-span-2">
          {canEditDepartments ? (
            <DepartmentMultiSelect
              value={person.departments}
              onChange={(departments) => onChange({ departments })}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              {person.departments.length > 0 ? (
                <DepartmentChips departments={person.departments} />
              ) : (
                <p className="text-sm text-slate-600">{personDepartmentsLabel(person.departments)}</p>
              )}
            </div>
          )}
        </Labeled>
      </div>

      <PersonTaskStatsPanel stats={person.taskStats ?? EMPTY_PERSON_TASK_STATS} />
    </section>
  );
}

function PersonTaskStatsPanel({ stats }: { stats: PersonTaskStats }) {
  const fields: (keyof PersonTaskStats)[] = [
    "tasksCompleted",
    "tasksFinishedMarked",
    "feedbackRequested",
    "feedbackGiven",
    "tasksAssigned",
    "tasksPostponed",
  ];
  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task activity</h4>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div key={field} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
            <dt className="text-[11px] font-medium text-slate-500">{personStatsLabel(field)}</dt>
            <dd className="mt-0.5 tabular-nums text-lg font-semibold text-slate-900">
              {Math.max(0, stats[field] ?? 0)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Labeled({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-slate-600">{label}</span>
      {children}
    </label>
  );
}
