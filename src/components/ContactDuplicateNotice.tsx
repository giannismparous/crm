import { useT } from "../contexts/I18nContext";
import type { ContactDuplicateMatch } from "../utils/contactDuplicates";
import { contactDisplayName } from "../utils/contactDuplicates";

function duplicateReasonLabel(reasons: ("email" | "phone")[], t: ReturnType<typeof useT>): string {
  if (reasons.includes("email") && reasons.includes("phone")) return t("contacts.duplicate.reason.both");
  if (reasons.includes("email")) return t("contacts.duplicate.reason.email");
  return t("contacts.duplicate.reason.phone");
}

function DuplicateList({
  matches,
  onSelectContact,
  t,
}: {
  matches: ContactDuplicateMatch[];
  onSelectContact: (contactId: string) => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <ul className="mt-2 space-y-1 border-t border-current/10 pt-2">
      {matches.map((m) => (
        <li key={m.contact.id}>
          <button
            type="button"
            onClick={() => onSelectContact(m.contact.id)}
            className="w-full rounded-md px-1 py-1 text-left hover:bg-black/5"
          >
            <span className="font-medium">{contactDisplayName(m.contact)}</span>
            {m.contact.company.trim() && (
              <span className="opacity-80"> · {m.contact.company.trim()}</span>
            )}
            <span className="mt-0.5 block text-[10px] font-normal opacity-75">
              {duplicateReasonLabel(m.reasons, t)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ContactDuplicateNotice({
  matches,
  expanded,
  onToggleExpanded,
  onSelectContact,
  onOkayWithDuplicates,
  onMergeContacts,
  acknowledged = false,
}: {
  matches: ContactDuplicateMatch[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelectContact: (contactId: string) => void;
  onOkayWithDuplicates?: () => void;
  onMergeContacts?: () => void;
  acknowledged?: boolean;
}) {
  const t = useT();

  if (matches.length === 0) return null;

  const toggleLabel = expanded
    ? matches.length === 1
      ? t("contacts.duplicate.hide_one")
      : t("contacts.duplicate.hide_other")
    : matches.length === 1
      ? t("contacts.duplicate.view_one")
      : t("contacts.duplicate.view_other");

  if (acknowledged) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-700">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-slate-950"
        >
          {toggleLabel}
        </button>
        {expanded && (
          <DuplicateList matches={matches} onSelectContact={onSelectContact} t={t} />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
      <p className="leading-relaxed">
        {matches.length === 1
          ? t("contacts.duplicate.single", {
              reason: duplicateReasonLabel(matches[0]!.reasons, t),
            })
          : t("contacts.duplicate.multiple", { count: String(matches.length) })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onOkayWithDuplicates && (
          <button
            type="button"
            onClick={onOkayWithDuplicates}
            className="rounded-lg border border-amber-300/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100/60"
          >
            {t("contacts.duplicate.okay")}
          </button>
        )}
        {onMergeContacts && (
          <button
            type="button"
            onClick={onMergeContacts}
            className="rounded-lg bg-amber-900 px-2.5 py-1 text-[11px] font-semibold text-amber-50 hover:bg-amber-950"
          >
            {t("contacts.duplicate.merge")}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded-lg px-1 py-1 font-medium text-amber-900 underline decoration-amber-400/80 underline-offset-2 hover:text-amber-950"
        >
          {toggleLabel}
        </button>
      </div>
      {expanded && (
        <DuplicateList matches={matches} onSelectContact={onSelectContact} t={t} />
      )}
    </div>
  );
}
