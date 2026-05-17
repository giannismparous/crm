import { useMemo, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import {
  ADMIN_ASSIGNABLE_ROLES,
  ORG_ROLE_LABELS,
  SEED_ASSIGNABLE_ROLES,
  type OrgRole,
} from "../auth/roles";
import type { Person, RegistrationSeed } from "../types";

function seedPersonLabel(people: Person[], id: string, email: string): string {
  if (email.trim()) return email.trim();
  const p = people.find((x) => x.id === id);
  return p?.name.trim() || p?.email.trim() || "Unknown";
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SettingsModal({
  open,
  onClose,
  people,
  seeds,
  currentUserId,
  onCreateSeed,
  onUpdateOrgRole,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  seeds: RegistrationSeed[];
  currentUserId: string;
  onCreateSeed: (orgRole: OrgRole) => Promise<RegistrationSeed>;
  onUpdateOrgRole: (personId: string, orgRole: OrgRole) => Promise<void>;
}) {
  const [seedRole, setSeedRole] = useState<OrgRole>("member");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const team = useMemo(
    () =>
      [...people]
        .filter((p) => p.authUid)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people]
  );

  const recentSeeds = useMemo(() => seeds.slice(0, 12), [seeds]);

  if (!open) return null;

  async function handleCreateSeed() {
    setBusy(true);
    setMessage(null);
    setCopied(false);
    try {
      const seed = await onCreateSeed(seedRole);
      setLastCode(seed.id);
      setMessage({
        text: `Seed created for ${ORG_ROLE_LABELS[seedRole]}. Share the code once — it can only be used once.`,
        error: false,
      });
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Could not create seed",
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
      setMessage({ text: "Could not copy — select and copy the code manually.", error: true });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-3 py-8 sm:py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 id="settings-title" className="font-display text-base font-semibold text-slate-900">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(70vh,32rem)] space-y-6 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Registration seed
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              One-time code for a new teammate to register with email and password. The seed sets their
              platform role and is stored with their account after use.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-slate-600">
                Role for new user
                <select
                  value={seedRole}
                  onChange={(e) => setSeedRole(e.target.value as OrgRole)}
                  className="input-base mt-1 block w-full min-w-[8rem] py-1.5 text-sm"
                >
                  {SEED_ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ORG_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCreateSeed()}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-dim disabled:opacity-60"
              >
                {busy ? "Creating…" : "Generate seed"}
              </button>
            </div>
            {lastCode && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                  New seed (copy now)
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-emerald-950">{lastCode}</code>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-50"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            {recentSeeds.length > 0 && (
              <ul className="mt-3 space-y-2 text-xs text-slate-600">
                {recentSeeds.map((s) => (
                  <li key={s.id} className="rounded-md bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
                    <p className="font-mono text-[10px] text-slate-400">{s.id.slice(0, 8)}…</p>
                    <p className="mt-0.5 text-slate-800">
                      <span className="font-medium text-slate-500">Role:</span> {ORG_ROLE_LABELS[s.orgRole]}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Issued by:</span>{" "}
                      {seedPersonLabel(people, s.issuedById, s.issuedByEmail)}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">Claimed by:</span>{" "}
                      {s.used ? (
                        seedPersonLabel(people, s.usedById ?? "", s.usedByEmail ?? "")
                      ) : (
                        <span className="font-medium text-amber-700">Unclaimed</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{formatWhen(s.issuedAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team roles</h3>
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {team.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {p.name}
                      {p.id === currentUserId && (
                        <span className="ml-1 text-xs font-normal text-indigo-600">(you)</span>
                      )}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">{p.email}</p>
                  </div>
                  <select
                    value={p.orgRole}
                    disabled={p.id === currentUserId}
                    title={p.id === currentUserId ? "You cannot change your own role here" : undefined}
                    onChange={(e) => {
                      const next = e.target.value as OrgRole;
                      void onUpdateOrgRole(p.id, next).catch((err) => {
                        setMessage({
                          text: err instanceof Error ? err.message : "Could not update role",
                          error: true,
                        });
                      });
                    }}
                    className="input-base max-w-[7.5rem] py-1 text-xs disabled:opacity-60"
                  >
                    {ADMIN_ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ORG_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>

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
