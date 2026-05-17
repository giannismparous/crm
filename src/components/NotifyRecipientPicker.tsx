import { useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "../types";
import { TEAM_DEPARTMENTS, departmentChipClass } from "../types";

function personMatchesSearch(p: Person, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${p.name} ${p.email} ${p.title} ${p.departments.join(" ")}`.toLowerCase().includes(s);
}

const DEPARTMENT_LIST: string[] = [...TEAM_DEPARTMENTS];

export function NotifyRecipientPicker({
  people,
  personIds,
  departmentIds,
  onChange,
  excludePersonId,
  excludePersonIds = [],
}: {
  people: Person[];
  personIds: string[];
  departmentIds: string[];
  onChange: (personIds: string[], departmentIds: string[]) => void;
  excludePersonId?: string;
  /** Hidden from the list (e.g. people already on the task). */
  excludePersonIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const hiddenIds = useMemo(() => {
    const s = new Set<string>();
    if (excludePersonId) s.add(excludePersonId);
    for (const id of excludePersonIds) if (id) s.add(id);
    return s;
  }, [excludePersonId, excludePersonIds]);

  const pool = useMemo(() => people.filter((p) => !hiddenIds.has(p.id)), [people, hiddenIds]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const filteredPeople = useMemo(
    () => pool.filter((p) => personMatchesSearch(p, search)),
    [pool, search]
  );
  const filteredDepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return DEPARTMENT_LIST;
    return DEPARTMENT_LIST.filter((d) => d.toLowerCase().includes(q));
  }, [search]);

  function togglePerson(id: string) {
    if (personIds.includes(id)) onChange(personIds.filter((x) => x !== id), departmentIds);
    else onChange([...personIds, id], departmentIds);
  }

  function toggleDept(dept: string) {
    if (departmentIds.includes(dept)) onChange(personIds, departmentIds.filter((d) => d !== dept));
    else onChange(personIds, [...departmentIds, dept]);
  }

  const summary = useMemo(() => {
    if (personIds.length === 0 && departmentIds.length === 0) return "Choose who to notify…";
    const bits: string[] = [];
    if (personIds.length === 1) bits.push(pool.find((p) => p.id === personIds[0])?.name ?? "1 person");
    else if (personIds.length > 1) bits.push(`${personIds.length} people`);
    if (departmentIds.length === 1) bits.push(departmentIds[0]!);
    else if (departmentIds.length > 1) bits.push(`${departmentIds.length} sectors`);
    return bits.join(", ");
  }, [personIds, departmentIds, pool]);

  return (
    <div className="relative w-full min-w-[12rem] max-w-md" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input-base flex h-9 w-full items-center justify-between gap-2 rounded-lg py-0 pl-2.5 pr-2 text-left text-xs"
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
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[14rem] rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black/5"
          role="listbox"
          aria-label="Choose who to notify"
        >
          <input
            type="search"
            placeholder="Search people or sectors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base mb-1.5 w-full py-1.5 text-xs"
          />
          <div className="max-h-52 overflow-y-auto text-xs">
            {filteredPeople.length > 0 && (
              <>
                <p className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  People
                </p>
                {filteredPeople.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={personIds.includes(p.id)}
                      onChange={() => togglePerson(p.id)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.name}</span>
                  </label>
                ))}
              </>
            )}
            {filteredDepts.length > 0 && (
              <>
                <p className="mt-1 border-t border-slate-100 px-1.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Sectors
                </p>
                {filteredDepts.map((d) => (
                  <label
                    key={d}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={departmentIds.includes(d)}
                      onChange={() => toggleDept(d)}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${departmentChipClass(d)}`}
                    >
                      {d}
                    </span>
                  </label>
                ))}
              </>
            )}
          </div>
          {(personIds.length > 0 || departmentIds.length > 0) && (
            <button
              type="button"
              className="mt-1.5 w-full rounded-md border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => onChange([], [])}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
