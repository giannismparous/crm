import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import type { Person, PersonTaskStats } from "../types";
import { PersonPresenceAvatar } from "./PersonPresenceAvatar";
import { useOnlinePersonIds, usePresenceTick } from "../hooks/usePresence";
import { usePresenceMap } from "../contexts/PresenceContext";
import { ProfilePhotoAvatar } from "./ProfilePhotoEditor";
import { BufferedTextInput } from "./BufferedTextInput";
import { EMPTY_PERSON_TASK_STATS } from "../utils/personTaskStats";
import { hasPrivilege, type OrgRole } from "../auth/roles";
import { OrgRoleWithInfo } from "./OrgRoleWithInfo";
import { useI18n, useT } from "../contexts/I18nContext";
import { translateDepartment } from "../i18n/helpers";
import { MobileDetailBack } from "./MobileDetailBack";
import {
  TEAM_DEPARTMENTS,
  departmentChipClass,
  departmentPickerChipClass,
  personSortKey,
} from "../types";

const STATS_FIELD_KEYS: Record<keyof PersonTaskStats, string> = {
  tasksCompleted: "team.stats.completed",
  tasksFinishedMarked: "team.stats.markedFinished",
  feedbackRequested: "team.stats.feedbackRequested",
  feedbackGiven: "team.stats.feedbackGiven",
  tasksAssigned: "team.stats.assigned",
  tasksPostponed: "team.stats.postponed",
};

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

const TEAM_VIEW_DEFAULTS = {
  query: "",
  deptFilter: "",
  selectedId: "",
};

export function TeamTab({
  people,
  currentUserId,
  currentUserOrgRole,
  onUpdatePerson,
  focusPersonId,
  onFocusPersonHandled,
}: {
  people: Person[];
  currentUserId: string;
  currentUserOrgRole: OrgRole;
  onUpdatePerson: (id: string, patch: Partial<Person>) => Promise<void>;
  focusPersonId?: string | null;
  onFocusPersonHandled?: () => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const presenceMap = usePresenceMap();
  const nowMs = usePresenceTick(true);
  const onlineIds = useOnlinePersonIds(presenceMap, nowMs);
  const saved = useMemo(() => readPersistedTabState("team", TEAM_VIEW_DEFAULTS), []);
  const [selectedId, setSelectedId] = useState(() => saved.selectedId);
  const [query, setQuery] = useState(() => saved.query);
  const [deptFilter, setDeptFilter] = useState<string>(() => saved.deptFilter);

  usePersistedTabState("team", { query, deptFilter, selectedId });

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

  useEffect(() => {
    const id = focusPersonId?.trim();
    if (!id) return;
    if (people.some((p) => p.id === id)) {
      setSelectedId(id);
      setQuery("");
      setDeptFilter("");
    }
    onFocusPersonHandled?.();
  }, [focusPersonId, people, onFocusPersonHandled]);

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
      <aside className={`space-y-4 ${selected ? "hidden lg:block" : ""}`}>
        <h2 className="font-display text-base font-semibold text-slate-900">{t("team.title")}</h2>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("common.search")}
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
            {t("team.allCount", { count: String(people.length) })}
          </button>
          {byDepartment.map(([dept, count]) => (
            <button
              key={dept}
              type="button"
              onClick={() => setDeptFilter(deptFilter === dept ? "" : dept)}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset transition ${
                deptFilter === dept
                  ? departmentPickerChipClass(dept, true)
                  : departmentPickerChipClass(dept, false)
              }`}
            >
              {dept === "Unassigned"
                ? t("team.deptCount", { dept: t("common.unassigned"), count: String(count) })
                : t("team.deptCount", { dept: translateDepartment(locale, dept), count: String(count) })}
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
                    <PersonPresenceAvatar person={p} size="md" online={onlineIds.has(p.id)} />
                    <div className="min-w-0 flex-1">
                      <OrgRoleWithInfo role={p.orgRole} size="xs" showInfo={false} />
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                        {p.name}
                        {isYou && (
                          <span className="ml-1 text-[10px] font-medium text-indigo-600">{t("common.you")}</span>
                        )}
                      </p>
                      <DepartmentChips departments={depts} max={2} size="xs" locale={locale} t={t} />
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
            {people.length === 0 ? t("team.empty.noUsers") : t("common.noMatches")}
          </p>
        )}
      </aside>

      {selected ? (
        <div>
          <MobileDetailBack onBack={() => setSelectedId("")} />
          <PersonDetail
          person={selected}
          isYou={selected.id === currentUserId}
          canEditDetails={selected.id === currentUserId || currentUserOrgRole === "founder"}
          canEditDepartments={hasPrivilege(currentUserOrgRole, "manageOrgRoles")}
          onChange={(patch) => void onUpdatePerson(selected.id, patch).catch(console.error)}
          locale={locale}
          t={t}
        />
        </div>
      ) : (
        <div className="glass-strong hidden min-h-[320px] items-center justify-center rounded-3xl p-8 text-center text-slate-500 lg:flex">
          {t("team.selectMember")}
        </div>
      )}
    </div>
  );
}

function DepartmentChips({
  departments,
  max = 3,
  size = "sm",
  locale,
  t,
}: {
  departments: string[];
  max?: number;
  size?: "xs" | "sm";
  locale: ReturnType<typeof useI18n>["locale"];
  t: ReturnType<typeof useT>;
}) {
  if (departments.length === 0) {
    return (
      <span
        className={`mt-1 inline-block rounded-full px-1.5 py-0.5 font-semibold ring-1 ring-inset ${departmentChipClass("")} ${
          size === "xs" ? "text-[9px]" : "text-xs"
        }`}
      >
        {t("common.unassigned")}
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
          {translateDepartment(locale, d)}
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
  locale,
  t,
}: {
  value: string[];
  onChange: (departments: string[]) => void;
  locale: ReturnType<typeof useI18n>["locale"];
  t: ReturnType<typeof useT>;
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
      ? t("team.chooseDepartments")
      : selected.length === 1
        ? translateDepartment(locale, selected[0]!)
        : t("common.nDepartments", { count: String(selected.length) });

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
            aria-label={t("team.deptAria")}
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
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${departmentPickerChipClass(d, selected.includes(d))}`}
                  >
                    {translateDepartment(locale, d)}
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
                {t("common.clear")}
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
  canEditDetails,
  canEditDepartments,
  onChange,
  locale,
  t,
}: {
  person: Person;
  isYou: boolean;
  canEditDetails: boolean;
  canEditDepartments: boolean;
  onChange: (patch: Partial<Person>) => void | Promise<void>;
  locale: ReturnType<typeof useI18n>["locale"];
  t: ReturnType<typeof useT>;
}) {
  const departmentsDisplay =
    person.departments.length > 0
      ? person.departments.map((d) => translateDepartment(locale, d)).join(", ")
      : t("common.unassigned");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="flex items-center gap-6 border-b border-slate-100 pb-6 sm:gap-8">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-1 sm:gap-1.5">
          <OrgRoleWithInfo role={person.orgRole} size="md" showInfo={false} />
          <h3 className="font-display text-3xl font-semibold leading-none text-slate-900 sm:text-4xl lg:text-5xl">
            {person.name}
            {isYou && (
              <span className="ml-2 text-xl font-medium text-indigo-600 sm:text-2xl lg:text-3xl">{t("common.you")}</span>
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
        <Labeled label={t("team.displayName")}>
          <BufferedTextInput
            entityKey={`${person.id}:name`}
            value={person.name}
            onCommit={(name) => onChange({ name })}
            trim
            readOnly={!canEditDetails}
            className={`input-base ${!canEditDetails ? "bg-slate-50 text-slate-600" : ""}`}
          />
        </Labeled>
        <Labeled label={t("team.titleField")}>
          <BufferedTextInput
            entityKey={`${person.id}:title`}
            value={person.title}
            onCommit={(title) => onChange({ title })}
            trim
            placeholder={t("team.titlePlaceholder")}
            readOnly={!canEditDetails}
            className={`input-base ${!canEditDetails ? "bg-slate-50 text-slate-600" : ""}`}
          />
        </Labeled>
        <Labeled label={t("common.email")}>
          <input type="email" value={person.email} readOnly className="input-base bg-slate-50 text-slate-600" />
        </Labeled>
        <Labeled label={t("team.departments")} className="sm:col-span-2">
          {canEditDepartments ? (
            <DepartmentMultiSelect
              value={person.departments}
              onChange={(departments) => onChange({ departments })}
              locale={locale}
              t={t}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              {person.departments.length > 0 ? (
                <DepartmentChips departments={person.departments} locale={locale} t={t} />
              ) : (
                <p className="text-sm text-slate-600">{departmentsDisplay}</p>
              )}
            </div>
          )}
        </Labeled>
      </div>

      <PersonTaskStatsPanel stats={person.taskStats ?? EMPTY_PERSON_TASK_STATS} t={t} />
    </section>
  );
}

function PersonTaskStatsPanel({
  stats,
  t,
}: {
  stats: PersonTaskStats;
  t: ReturnType<typeof useT>;
}) {
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
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("team.activityTitle")}</h4>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div key={field} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
            <dt className="text-[11px] font-medium text-slate-500">{t(STATS_FIELD_KEYS[field])}</dt>
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
