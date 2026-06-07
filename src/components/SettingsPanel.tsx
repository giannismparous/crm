import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X, Copy, Check, Sun, Moon, Type, ChevronDown } from "lucide-react";
import { ORG_ROLE_LABELS, SEED_ASSIGNABLE_ROLES, type OrgRole } from "../auth/roles";
import { InfoTooltip } from "./InfoTooltip";
import { RoleInfoTip } from "./RoleInfoTip";
import type { CreateRegistrationSeedInput, Person, RegistrationSeed } from "../types";
import { PARTNER_ACCOUNT_MONTH_OPTIONS, SEED_VALID_DAYS_MAX, isSeedExpired } from "../utils/accountExpiry";
import { TEAM_DEPARTMENTS, departmentChipClass } from "../types";
import { formatInOrgTime } from "../utils/orgTimezone";
import { useAppearance } from "../hooks/useAppearance";

const SEED_VALID_DAYS = SEED_VALID_DAYS_MAX;

function seedPersonLabel(people: Person[], id: string, email: string): string {
  if (email.trim()) return email.trim();
  const p = people.find((x) => x.id === id);
  return p?.name.trim() || p?.email.trim() || "Unknown";
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const formatted = formatInOrgTime(iso, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatted || iso;
}

function SectionInfoTip({ text, label }: { text: string; label: string }) {
  return <InfoTooltip text={text} label={label} />;
}

function RoleSelect({ value, onChange }: { value: OrgRole; onChange: (role: OrgRole) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block w-fit">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input-base !inline-flex !w-auto cursor-pointer items-center gap-1.5 whitespace-nowrap !py-1.5 !pl-3 !pr-2.5 text-sm"
      >
        <span>{ORG_ROLE_LABELS[value]}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Role"
          className="absolute left-0 top-full z-50 mt-1 min-w-full w-max rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {SEED_ASSIGNABLE_ROLES.map((role) => (
            <li key={role} role="option" aria-selected={role === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(role);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  role === value ? "bg-slate-50 font-medium text-slate-900" : "text-slate-700"
                }`}
              >
                <span>{ORG_ROLE_LABELS[role]}</span>
                <RoleInfoTip role={role} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsSection({
  title,
  titleNote,
  titleInfo,
  children,
}: {
  title: string;
  titleNote?: string;
  titleInfo?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {titleInfo ? <SectionInfoTip text={titleInfo} label={`About ${title}`} /> : null}
        {titleNote ? <span className="text-xs font-normal text-slate-400">{titleNote}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CollapseHeader({
  title,
  meta,
  expanded,
  onToggle,
}: {
  title: string;
  meta?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="collapse-header flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-slate-50"
    >
      <span
        className={`inline-block shrink-0 text-[10px] text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        aria-hidden
      >
        ▸
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 settings-muted">{title}</span>
      {meta ? <span className="text-[10px] tabular-nums text-slate-400 settings-muted">{meta}</span> : null}
    </button>
  );
}

function SeedDepartmentPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (departments: string[]) => void;
}) {
  const selected = value.filter((d) => TEAM_DEPARTMENTS.includes(d as (typeof TEAM_DEPARTMENTS)[number]));
  return (
    <div className="flex flex-wrap gap-1.5">
      {TEAM_DEPARTMENTS.map((dept) => {
        const active = selected.includes(dept);
        return (
          <button
            key={dept}
            type="button"
            onClick={() =>
              onChange(active ? selected.filter((d) => d !== dept) : [...selected, dept])
            }
            className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
              active ? departmentChipClass(dept) : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {dept}
          </button>
        );
      })}
    </div>
  );
}

function GoogleCalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" fill="#fff" />
      <rect x="3" y="4" width="18" height="5" fill="#1A73E8" />
      <rect x="7" y="2" width="2" height="4" rx="1" fill="#1A73E8" />
      <rect x="15" y="2" width="2" height="4" rx="1" fill="#1A73E8" />
      <rect x="6" y="11" width="3" height="3" rx="0.5" fill="#34A853" />
      <rect x="10.5" y="11" width="3" height="3" rx="0.5" fill="#FBBC04" />
      <rect x="15" y="11" width="3" height="3" rx="0.5" fill="#EA4335" />
      <rect x="6" y="15.5" width="3" height="3" rx="0.5" fill="#4285F4" />
      <rect x="10.5" y="15.5" width="3" height="3" rx="0.5" fill="#34A853" />
    </svg>
  );
}

function GmailIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path fill="#fff" d="m4 7 8 6 8-6v10H4V7z" />
      <path fill="#FBBC04" d="M4 7 8 6 4 17V7z" />
      <path fill="#34A853" d="M20 7 12 13 20 17V7z" />
      <path fill="#C5221F" d="M4 17 12 13 4 7v10z" />
    </svg>
  );
}

export function SettingsModal({
  open,
  onClose,
  people,
  seeds,
  currentUserId,
  onCreateSeed,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  seeds: RegistrationSeed[];
  currentUserId: string;
  onCreateSeed: (input: CreateRegistrationSeedInput) => Promise<RegistrationSeed>;
}) {
  const { theme, fontScale, setTheme, setFontScale, fontScaleMin, fontScaleMax } = useAppearance(currentUserId);
  const [seedRole, setSeedRole] = useState<OrgRole>("partner");
  const [seedDepartments, setSeedDepartments] = useState<string[]>([]);
  const [accountValidMonths, setAccountValidMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codesExpanded, setCodesExpanded] = useState(false);

  const sortedSeeds = useMemo(
    () => [...seeds].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    [seeds]
  );

  if (!open) return null;

  async function handleCreateSeed() {
    if (seedRole === "partner" && seedDepartments.length === 0) {
      setMessage({ text: "Pick at least one department.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    setCopied(false);
    try {
      const seed = await onCreateSeed({
        orgRole: seedRole,
        departments: seedRole === "founder" ? [] : seedDepartments,
        validDays: SEED_VALID_DAYS,
        accountValidMonths: seedRole === "partner" ? accountValidMonths : undefined,
      });
      setLastCode(seed.id);
      setMessage({
        text: "Code ready — copy and share it once.",
        error: false,
      });
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Could not create code",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!lastCode) return;
    try {
      await navigator.clipboard.writeText(lastCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ text: "Could not copy — select and copy manually.", error: true });
    }
  }

  const fontScalePct = Math.round(fontScale * 100);
  const canGenerateCode = seedRole === "founder" || seedDepartments.length > 0;

  return (
    <div
      className="settings-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-3 py-8 sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="settings-surface w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-border flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 id="settings-title" className="font-display text-base font-semibold text-slate-900">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(70vh,32rem)] space-y-6 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <SettingsSection
            title="Partner codes"
            titleInfo="Issue a one-time code and give it to new partners. Each code is valid for 7 days."
          >
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-600 settings-muted">
                Role
                <div className="mt-1">
                  <RoleSelect value={seedRole} onChange={setSeedRole} />
                </div>
              </label>

              {seedRole === "partner" && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-slate-600 settings-muted">Departments</span>
                  <SeedDepartmentPicker value={seedDepartments} onChange={setSeedDepartments} />
                </div>
              )}

              {seedRole === "partner" && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="shrink-0 text-xs font-medium text-slate-600 settings-muted">
                    Account access
                  </span>
                  <select
                    value={accountValidMonths}
                    onChange={(e) => setAccountValidMonths(Number(e.target.value))}
                    className="input-base !inline-block !w-auto max-w-full cursor-pointer whitespace-nowrap py-1.5 pl-3 pr-10 text-sm"
                  >
                    {PARTNER_ACCOUNT_MONTH_OPTIONS.map((months) => (
                      <option key={months} value={months}>
                        {months} {months === 1 ? "month" : "months"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                disabled={busy || !canGenerateCode}
                onClick={() => void handleCreateSeed()}
                className="cursor-pointer rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Creating…" : "Generate code"}
              </button>
            </div>

            {lastCode && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800">New code</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-emerald-950">{lastCode}</code>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {sortedSeeds.length > 0 && (
              <div className="mt-3">
                <CollapseHeader
                  title="Issued codes"
                  meta={`${sortedSeeds.length}`}
                  expanded={codesExpanded}
                  onToggle={() => setCodesExpanded((v) => !v)}
                />
                {codesExpanded && (
                  <ul className="mt-1 space-y-1.5 pl-1 text-xs text-slate-600">
                    {sortedSeeds.map((s) => (
                      <li key={s.id} className="settings-card rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="font-mono text-[10px] text-slate-400">{s.id.slice(0, 8)}…</p>
                        <p className="mt-0.5 text-slate-800">{ORG_ROLE_LABELS[s.orgRole]}</p>
                        {s.orgRole === "partner" && (
                          <p className="mt-0.5 text-slate-600 settings-muted">{s.departments.join(", ")}</p>
                        )}
                        <p className="mt-0.5 text-[10px] text-slate-500 settings-muted">
                          {seedPersonLabel(people, s.issuedById, s.issuedByEmail)} ·{" "}
                          {s.used
                            ? seedPersonLabel(people, s.usedById ?? "", s.usedByEmail ?? "")
                            : "Unclaimed"}{" "}
                          · {formatWhen(s.issuedAt)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500 settings-muted">
                          Code {s.used ? "was valid until" : "expires"} {formatWhen(s.expiresAt)}
                          {!s.used && isSeedExpired(s) ? " · Expired" : ""}
                        </p>
                        {s.orgRole === "partner" && s.accountValidMonths ? (
                          <p className="mt-0.5 text-[10px] text-slate-500 settings-muted">
                            {s.accountValidMonths} {s.accountValidMonths === 1 ? "month" : "months"} access on redeem
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </SettingsSection>

          <SettingsSection title="Appearance">
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-600 settings-muted">Theme</span>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setTheme("bright")}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                      theme === "bright"
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-600"
                    }`}
                  >
                    <Sun className="h-3.5 w-3.5" aria-hidden />
                    Bright
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                      theme === "dark"
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-600"
                    }`}
                  >
                    <Moon className="h-3.5 w-3.5" aria-hidden />
                    Dark
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 settings-muted">
                    <Type className="h-3.5 w-3.5" aria-hidden />
                    Text size
                  </span>
                  <span className="text-[10px] tabular-nums text-slate-500 settings-muted">{fontScalePct}%</span>
                </div>
                <input
                  type="range"
                  min={fontScaleMin}
                  max={fontScaleMax}
                  step={0.05}
                  value={fontScale}
                  onChange={(e) => setFontScale(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer accent-accent"
                  aria-label="Adjust text size"
                />
                <p className="mt-1 text-[10px] text-slate-500 settings-muted">Drag to enlarge text across the app.</p>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Integrations" titleNote="(under development)">
            <div className="pointer-events-none space-y-2 opacity-50">
              <div className="settings-card flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                  <GoogleCalendarIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">Google Calendar</p>
                  <p className="text-[10px] text-slate-500">Sync appointments</p>
                </div>
              </div>
              <div className="settings-card flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                  <GmailIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">Gmail</p>
                  <p className="text-[10px] text-slate-500">Email from the CRM</p>
                </div>
              </div>
            </div>
          </SettingsSection>

          {message && (
            <p
              className={`rounded-lg border px-3 py-2 text-xs ${
                message.error
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
              role={message.error ? "alert" : "status"}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
