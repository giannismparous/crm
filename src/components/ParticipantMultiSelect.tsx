import { useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "../types";
import { TEAM_DEPARTMENTS, departmentChipClass } from "../types";
import { personDisplayName } from "../utils/appointments";
import { participantIdsCoveredByDepartments } from "../utils/appointmentParticipants";
import { useI18n } from "../contexts/I18nContext";
import { translateDepartment } from "../i18n/helpers";

function personMatchesSearch(p: Person, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    p.name.toLowerCase().includes(needle) ||
    p.email.toLowerCase().includes(needle) ||
    p.title.toLowerCase().includes(needle)
  );
}

export function ParticipantMultiSelect({
  people,
  participantIds,
  participantDepartmentIds,
  currentUserId,
  onChange,
  placeholder,
}: {
  people: Person[];
  participantIds: string[];
  participantDepartmentIds: string[];
  currentUserId: string;
  onChange: (participantIds: string[], participantDepartmentIds: string[]) => void;
  placeholder?: string;
}) {
  const { t, locale } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("pickers.participants");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selectablePeople = useMemo(
    () => people.filter((p) => p.id && (p.name.trim() || p.email.trim())),
    [people]
  );

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const filteredPeople = useMemo(
    () => selectablePeople.filter((p) => personMatchesSearch(p, search)),
    [selectablePeople, search]
  );
  const filteredDepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [...TEAM_DEPARTMENTS];
    return TEAM_DEPARTMENTS.filter((d) => d.toLowerCase().includes(q));
  }, [search]);

  const summary = useMemo(() => {
    const ids = participantIds.filter(Boolean);
    const depts = participantDepartmentIds.filter(Boolean);
    if (ids.length === 0 && depts.length === 0) return resolvedPlaceholder;
    const bits: string[] = [];
    if (ids.length === 1) {
      const p = selectablePeople.find((x) => x.id === ids[0]);
      bits.push(p ? personDisplayName(p) : t("common.onePerson"));
    } else if (ids.length > 1) bits.push(t("common.nPeople", { count: ids.length }));
    if (depts.length === 1) bits.push(translateDepartment(locale, depts[0]!));
    else if (depts.length > 1) bits.push(t("common.nDepartments", { count: depts.length }));
    return bits.join(", ");
  }, [participantIds, participantDepartmentIds, selectablePeople, resolvedPlaceholder, t, locale]);

  function stripDeptCoveredPeople(ids: string[], depts: string[]): string[] {
    const covered = participantIdsCoveredByDepartments(selectablePeople, depts);
    return ids.filter((id) => !covered.has(id));
  }

  function togglePerson(id: string) {
    const covered = participantIdsCoveredByDepartments(selectablePeople, participantDepartmentIds);
    if (covered.has(id) && !participantIds.includes(id)) return;
    if (participantIds.includes(id)) onChange(participantIds.filter((x) => x !== id), participantDepartmentIds);
    else onChange([...participantIds, id], participantDepartmentIds);
  }

  function toggleDept(dept: string) {
    const nextDepts = participantDepartmentIds.includes(dept)
      ? participantDepartmentIds.filter((d) => d !== dept)
      : [...participantDepartmentIds, dept];
    onChange(stripDeptCoveredPeople(participantIds, nextDepts), nextDepts);
  }

  const coveredByDept = useMemo(
    () => participantIdsCoveredByDepartments(selectablePeople, participantDepartmentIds),
    [selectablePeople, participantDepartmentIds]
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-base flex h-9 w-full items-center justify-between gap-1.5 rounded-lg py-0 pl-2 pr-1.5 text-left text-sm"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{summary}</span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[14rem] rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black/5">
          <input
            type="search"
            placeholder={t("common.searchPeopleDepts")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base mb-1.5 w-full py-1.5 text-xs"
          />
          {currentUserId && selectablePeople.some((p) => p.id === currentUserId) && (
            <button
              type="button"
              className="mb-1.5 w-full rounded-md border border-slate-200 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => {
                if (participantIds.includes(currentUserId) || coveredByDept.has(currentUserId)) {
                  if (participantIds.includes(currentUserId)) {
                    onChange(
                      participantIds.filter((x) => x !== currentUserId),
                      participantDepartmentIds
                    );
                  }
                } else {
                  onChange(
                    stripDeptCoveredPeople(
                      [...participantIds.filter(Boolean), currentUserId],
                      participantDepartmentIds
                    ),
                    participantDepartmentIds
                  );
                }
              }}
            >
              {participantIds.includes(currentUserId) || coveredByDept.has(currentUserId)
                ? t("common.removeMe")
                : t("common.addMe")}
            </button>
          )}
          <div className="max-h-52 overflow-y-auto text-xs">
            {filteredPeople.length > 0 && (
              <>
                <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("common.people")}
                </p>
                {filteredPeople.map((p) => {
                  const viaDept = coveredByDept.has(p.id) && !participantIds.includes(p.id);
                  return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${
                      viaDept ? "cursor-default opacity-80" : "cursor-pointer hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={participantIds.includes(p.id) || viaDept}
                      disabled={viaDept}
                      onChange={() => togglePerson(p.id)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30 disabled:opacity-70"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {personDisplayName(p)}
                      {viaDept ? (
                        <span className="ml-1 text-[10px] font-normal text-slate-400">
                          {t("common.deptSuffix")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  );
                })}
              </>
            )}
            {filteredDepts.length > 0 && (
              <>
                <p className="mt-1 border-t border-slate-100 px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("common.departments")}
                </p>
                {filteredDepts.map((d) => (
                  <label
                    key={d}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={participantDepartmentIds.includes(d)}
                      onChange={() => toggleDept(d)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${departmentChipClass(d)}`}
                    >
                      {translateDepartment(locale, d)}
                    </span>
                  </label>
                ))}
              </>
            )}
            {filteredPeople.length === 0 && filteredDepts.length === 0 && (
              <p className="px-1 py-2 text-center text-slate-500">{t("common.noMatches")}</p>
            )}
          </div>
          {(participantIds.length > 0 || participantDepartmentIds.length > 0) && (
            <button
              type="button"
              className="mt-1.5 w-full rounded-md border border-slate-200 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => onChange([], [])}
            >
              {t("common.clearAll")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
