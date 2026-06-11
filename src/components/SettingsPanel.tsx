import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X, Copy, Check, Sun, Moon, Type, ChevronDown } from "lucide-react";
import { SEED_ASSIGNABLE_ROLES, type OrgRole } from "../auth/roles";
import { APP_LOCALES, LOCALE_LABELS, useI18n, useT } from "../contexts/I18nContext";
import type { TFunction } from "../i18n/helpers";
import { translateDepartment, translateRole } from "../i18n/helpers";
import { InfoTooltip } from "./InfoTooltip";
import { RoleInfoTip } from "./RoleInfoTip";
import type { CreateRegistrationSeedInput, Person, RegistrationSeed } from "../types";
import { PARTNER_ACCOUNT_MONTH_OPTIONS, SEED_VALID_DAYS_MAX, isSeedExpired } from "../utils/accountExpiry";
import { TEAM_DEPARTMENTS, departmentChipClass } from "../types";
import { formatInOrgTime } from "../utils/orgTimezone";
import { useAppearance } from "../hooks/useAppearance";
import type { useTimezone } from "../hooks/useTimezone";
import { GoogleCalendarIntegration } from "./GoogleCalendarModal";
import { TimezoneSettingsField } from "./TimezoneSettingsField";

const SEED_VALID_DAYS = SEED_VALID_DAYS_MAX;

function seedPersonLabel(people: Person[], id: string, email: string, unknownLabel: string): string {
  if (email.trim()) return email.trim();
  const p = people.find((x) => x.id === id);
  return p?.name.trim() || p?.email.trim() || unknownLabel;
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

function seedCodeExpiryText(t: TFunction, used: boolean, expiresAt: string): string {
  const date = formatWhen(expiresAt);
  if (used) return `${t("settings.seeds.codeWasValid")} ${date}`;
  const codeLabel = t("settings.seeds.codeWasValid").replace(/\s+(was valid until|ήταν έγκυρος έως)$/u, "");
  return `${codeLabel} ${t("settings.seeds.codeExpires")} ${date}`;
}

function SectionInfoTip({ text, label }: { text: string; label: string }) {
  return <InfoTooltip text={text} label={label} />;
}

function RoleSelect({ value, onChange }: { value: OrgRole; onChange: (role: OrgRole) => void }) {
  const t = useT();
  const { locale } = useI18n();
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
        <span>{translateRole(locale, value)}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t("settings.seeds.roleAria")}
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
                <span>{translateRole(locale, role)}</span>
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
  const t = useT();
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {titleInfo ? (
          <SectionInfoTip text={titleInfo} label={t("settings.aboutSection", { title })} />
        ) : null}
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
  const { locale } = useI18n();
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
            {translateDepartment(locale, dept)}
          </button>
        );
      })}
    </div>
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
  canManageSeeds,
  googleCalendarOauthMessage,
  timezone,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  seeds: RegistrationSeed[];
  currentUserId: string;
  onCreateSeed: (input: CreateRegistrationSeedInput) => Promise<RegistrationSeed>;
  canManageSeeds: boolean;
  googleCalendarOauthMessage?: { text: string; error: boolean } | null;
  timezone: ReturnType<typeof useTimezone>;
}) {
  const t = useT();
  const { locale, setLocale } = useI18n();
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
      setMessage({ text: t("settings.seeds.pickDepartment"), error: true });
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
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : t("settings.seeds.createFailed"),
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
      setMessage({ text: t("settings.seeds.copyFailed"), error: true });
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
            {t("settings.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("settings.closeAria")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(75vh,36rem)] space-y-6 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {canManageSeeds && (
          <SettingsSection
            title={t("settings.seeds.title")}
            titleInfo={t("settings.seeds.info")}
          >
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-600 settings-muted">
                {t("settings.seeds.role")}
                <div className="mt-1">
                  <RoleSelect value={seedRole} onChange={setSeedRole} />
                </div>
              </label>

              {seedRole === "partner" && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-slate-600 settings-muted">
                    {t("settings.seeds.departments")}
                  </span>
                  <SeedDepartmentPicker value={seedDepartments} onChange={setSeedDepartments} />
                </div>
              )}

              {seedRole === "partner" && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="shrink-0 text-xs font-medium text-slate-600 settings-muted">
                    {t("settings.seeds.accountAccess")}
                  </span>
                  <select
                    value={accountValidMonths}
                    onChange={(e) => setAccountValidMonths(Number(e.target.value))}
                    className="input-base !inline-block !w-auto max-w-full cursor-pointer whitespace-nowrap py-1.5 pl-3 pr-10 text-sm"
                  >
                    {PARTNER_ACCOUNT_MONTH_OPTIONS.map((months) => (
                      <option key={months} value={months}>
                        {t("common.month", { count: months })}
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
                {busy ? t("settings.seeds.creating") : t("settings.seeds.generate")}
              </button>
            </div>

            {lastCode && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                  {t("settings.seeds.newCode")}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-emerald-950">{lastCode}</code>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? t("common.copied") : t("common.copy")}
                  </button>
                </div>
              </div>
            )}

            {sortedSeeds.length > 0 && (
              <div className="mt-3">
                <CollapseHeader
                  title={t("settings.seeds.issuedCodes")}
                  meta={`${sortedSeeds.length}`}
                  expanded={codesExpanded}
                  onToggle={() => setCodesExpanded((v) => !v)}
                />
                {codesExpanded && (
                  <ul className="mt-1 space-y-1.5 pl-1 text-xs text-slate-600">
                    {sortedSeeds.map((s) => (
                      <li key={s.id} className="settings-card rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="font-mono text-[10px] text-slate-400">{s.id.slice(0, 8)}…</p>
                        <p className="mt-0.5 text-slate-800">{translateRole(locale, s.orgRole)}</p>
                        {s.orgRole === "partner" && (
                          <p className="mt-0.5 text-slate-600 settings-muted">
                            {s.departments.map((d) => translateDepartment(locale, d)).join(", ")}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-slate-500 settings-muted">
                          {seedPersonLabel(people, s.issuedById, s.issuedByEmail, t("common.unknown"))} ·{" "}
                          {s.used
                            ? seedPersonLabel(people, s.usedById ?? "", s.usedByEmail ?? "", t("common.unknown"))
                            : t("settings.seeds.unclaimed")}{" "}
                          · {formatWhen(s.issuedAt)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500 settings-muted">
                          {seedCodeExpiryText(t, s.used, s.expiresAt)}
                          {!s.used && isSeedExpired(s) ? ` · ${t("settings.seeds.expired")}` : ""}
                        </p>
                        {s.orgRole === "partner" && s.accountValidMonths ? (
                          <p className="mt-0.5 text-[10px] text-slate-500 settings-muted">
                            {t("settings.seeds.accessOnRedeem", {
                              months: t("common.month", { count: s.accountValidMonths }),
                            })}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </SettingsSection>
          )}

          <SettingsSection title={t("settings.appearance.title")}>
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-600 settings-muted">
                  {t("common.language")}
                </span>
                <p className="mb-1.5 text-[10px] text-slate-500 settings-muted">{t("common.languageHint")}</p>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 shadow-inner">
                  {APP_LOCALES.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setLocale(loc)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                        locale === loc
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-600"
                      }`}
                    >
                      {LOCALE_LABELS[loc]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-600 settings-muted">
                  {t("settings.appearance.theme")}
                </span>
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
                    {t("settings.appearance.bright")}
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
                    {t("settings.appearance.dark")}
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 settings-muted">
                    <Type className="h-3.5 w-3.5" aria-hidden />
                    {t("settings.appearance.textSize")}
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
                  aria-label={t("settings.appearance.textSizeAria")}
                />
                <p className="mt-1 text-[10px] text-slate-500 settings-muted">
                  {t("settings.appearance.textSizeHint")}
                </p>
              </div>

              <TimezoneSettingsField timezone={timezone} />
            </div>
          </SettingsSection>

          <SettingsSection title={t("settings.integrations.title")}>
            <div className="space-y-2">
              <div className="settings-card rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
                <GoogleCalendarIntegration active={open} oauthMessage={googleCalendarOauthMessage} />
              </div>
              <div className="pointer-events-none space-y-2 opacity-50">
                <div className="settings-card flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
                    <GmailIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{t("settings.integrations.gmail")}</p>
                    <p className="text-[10px] text-slate-500">{t("settings.integrations.gmailSoon")}</p>
                  </div>
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
