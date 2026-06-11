import { useState, type FormEvent } from "react";
import { useT } from "../contexts/I18nContext";
import type { Person } from "../types";
import { departmentChipClass, personDepartmentsLabel } from "../types";
import { AppBrand } from "./AppBrand";
import { OrgRoleWithInfo } from "./OrgRoleWithInfo";
import { ProfilePhotoAvatar } from "./ProfilePhotoEditor";

export function ProfileSetupScreen({
  person,
  onUpdatePerson,
  onComplete,
}: {
  person: Person;
  onUpdatePerson: (id: string, patch: Partial<Person>) => Promise<void>;
  onComplete: (patch: { name: string; title: string }) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(person.name.trim() || person.email.split("@")[0] || "");
  const [title, setTitle] = useState(person.title.trim());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const departments = person.departments.filter(Boolean);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage(t("profileSetup.error.nameRequired"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await onComplete({ name: trimmedName, title: title.trim() });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("profileSetup.error.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1>
          <AppBrand size="auth" />
        </h1>
        <p className="mt-2 text-sm text-slate-600">{t("profileSetup.subtitle")}</p>

        <header className="mt-6 flex items-center gap-5 border-b border-slate-100 pb-6">
          <ProfilePhotoAvatar
            person={person}
            onChange={(patch) => onUpdatePerson(person.id, patch)}
            editable
            size="2xl"
            className="shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
                {name.trim() || person.email}
              </p>
              <OrgRoleWithInfo role={person.orgRole} size="sm" />
            </div>
            <p className="truncate text-sm text-slate-500 sm:text-base">{person.email}</p>
          </div>
        </header>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" noValidate>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t("profileSetup.displayName")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base w-full"
              autoComplete="name"
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t("profileSetup.title")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("profileSetup.titlePlaceholder")}
              className="input-base w-full"
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t("common.email")}</span>
            <input
              type="email"
              value={person.email}
              readOnly
              className="input-base w-full bg-slate-50 text-slate-600"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">{t("profileSetup.department")}</span>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              {departments.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {departments.map((d) => (
                    <span
                      key={d}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${departmentChipClass(d)}`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">{personDepartmentsLabel(departments)}</p>
              )}
              <p className="mt-1.5 text-[11px] text-slate-500">{t("profileSetup.departmentHint")}</p>
            </div>
          </div>

          {message && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{message}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-dim disabled:opacity-60"
          >
            {busy ? t("common.saving") : t("profileSetup.continue")}
          </button>
        </form>
      </div>
    </div>
  );
}
