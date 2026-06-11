import { useMemo, useState, type FormEvent } from "react";
import { useI18n, useT } from "../contexts/I18nContext";
import { translateContactStage } from "../i18n/helpers";
import type { ContactStage } from "../types";
import {
  MERGE_FIELD_KEYS,
  buildInitialMergeFormValues,
  contactHasSaveableIdentity,
  fieldHasConflict,
  getMergeFieldOptions,
  mergeValuesEqual,
  type MergeFieldKey,
  type MergeFormValues,
  type MergeSourceSnapshot,
} from "../utils/contactMerge";
import { CompanySuggestInput } from "./CompanySuggestInput";

function mergeFieldLabel(field: MergeFieldKey, t: ReturnType<typeof useT>): string {
  const keys: Record<MergeFieldKey, string> = {
    firstName: "contacts.firstName",
    lastName: "contacts.lastName",
    company: "contacts.company",
    jobTitle: "contacts.jobTitle",
    email: "common.email",
    phone: "contacts.phone",
    website: "contacts.website",
    stage: "contacts.stage",
    estimatedValue: "contacts.estDealValue",
    currency: "contacts.currency",
    lastContactedAt: "contacts.lastContacted",
    generalNotes: "common.notes",
  };
  return t(keys[field]);
}

function Labeled({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function MergeFieldRow({
  field,
  sources,
  values,
  onChange,
  companySuggestions,
  t,
}: {
  field: MergeFieldKey;
  sources: MergeSourceSnapshot[];
  values: MergeFormValues;
  onChange: (field: MergeFieldKey, value: string) => void;
  companySuggestions: string[];
  t: ReturnType<typeof useT>;
}) {
  const conflict = fieldHasConflict(field, sources);
  const options = useMemo(() => getMergeFieldOptions(field, sources), [field, sources]);
  const label = mergeFieldLabel(field, t);

  return (
    <div className={field === "generalNotes" ? "sm:col-span-2" : field === "website" ? "sm:col-span-2" : ""}>
      <Labeled label={label}>
        {conflict && (
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t("contacts.merge.chooseField", { field: label })}>
            {options.map((opt) => {
              const active = mergeValuesEqual(field, values[field], opt.value);
              return (
                <button
                  key={`${opt.sourceId}-${opt.value}`}
                  type="button"
                  onClick={() => onChange(field, opt.value)}
                  className={`rounded-lg border px-2 py-1 text-left text-[11px] leading-snug transition ${
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-950"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="font-medium">{opt.sourceLabel}</span>
                  <span className="mt-0.5 block text-slate-600">{opt.display}</span>
                </button>
              );
            })}
          </div>
        )}
        <MergeFieldInput
          field={field}
          value={values[field]}
          onChange={(v) => onChange(field, v)}
          companySuggestions={companySuggestions}
        />
      </Labeled>
    </div>
  );
}

function MergeFieldInput({
  field,
  value,
  onChange,
  companySuggestions,
}: {
  field: MergeFieldKey;
  value: string;
  onChange: (value: string) => void;
  companySuggestions: string[];
}) {
  const t = useT();
  const { locale } = useI18n();

  if (field === "company") {
    return (
      <CompanySuggestInput value={value} onChange={onChange} suggestions={companySuggestions} className="input-base" />
    );
  }
  if (field === "stage") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-base">
        {(["lead", "qualified", "proposal", "negotiation", "customer", "churned"] as ContactStage[]).map((s) => (
          <option key={s} value={s}>
            {translateContactStage(locale, s)}
          </option>
        ))}
      </select>
    );
  }
  if (field === "generalNotes") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="input-base min-h-[120px] resize-y"
      />
    );
  }
  if (field === "lastContactedAt") {
    return (
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
      />
    );
  }
  if (field === "estimatedValue") {
    return (
      <input
        type="number"
        min={0}
        step="100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
      />
    );
  }
  if (field === "currency") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-base">
        <option value="EUR">{t("common.currency.eur")}</option>
        <option value="USD">{t("common.currency.usd")}</option>
        <option value="GBP">{t("common.currency.gbp")}</option>
      </select>
    );
  }
  if (field === "email") {
    return <input type="email" value={value} onChange={(e) => onChange(e.target.value)} className="input-base" />;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className="input-base" />;
}

export function ContactMergePanel({
  sources,
  companySuggestions,
  onConfirm,
  onCancel,
}: {
  sources: MergeSourceSnapshot[];
  companySuggestions: string[];
  onConfirm: (values: MergeFormValues) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [values, setValues] = useState(() => buildInitialMergeFormValues(sources));

  const conflictCount = useMemo(
    () => MERGE_FIELD_KEYS.filter((f) => fieldHasConflict(f, sources)).length,
    [sources]
  );

  function patchField(field: MergeFieldKey, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  const canSave = contactHasSaveableIdentity(values.firstName, values.lastName, values.company);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onConfirm(values);
  }

  const gridFields = MERGE_FIELD_KEYS.filter((f) => f !== "generalNotes");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="border-b border-slate-100 pb-4">
        <h3 className="font-display text-xl font-semibold text-slate-900">{t("contacts.merge.title")}</h3>
        {conflictCount > 0 && (
          <p className="mt-2 text-xs text-amber-800">
            {conflictCount === 1
              ? t("contacts.merge.conflicts_one", { count: String(conflictCount) })
              : t("contacts.merge.conflicts_other", { count: String(conflictCount) })}
          </p>
        )}
      </header>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {gridFields.map((field) => (
            <MergeFieldRow
              key={field}
              field={field}
              sources={sources}
              values={values}
              onChange={patchField}
              companySuggestions={companySuggestions}
              t={t}
            />
          ))}
        </div>

        <MergeFieldRow
          field="generalNotes"
          sources={sources}
          values={values}
          onChange={patchField}
          companySuggestions={companySuggestions}
          t={t}
        />

        <p className="text-xs text-slate-500">{t("contacts.merge.hint")}</p>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("contacts.merge.save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("common.back")}
          </button>
        </div>
      </form>
    </section>
  );
}
