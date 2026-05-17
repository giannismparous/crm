import type { ContactDuplicateMatch } from "../utils/contactDuplicates";
import { contactDisplayName, duplicateReasonLabel } from "../utils/contactDuplicates";

function DuplicateList({
  matches,
  onSelectContact,
}: {
  matches: ContactDuplicateMatch[];
  onSelectContact: (contactId: string) => void;
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
              {duplicateReasonLabel(m.reasons)}
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
  if (matches.length === 0) return null;

  if (acknowledged) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-700">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-slate-950"
        >
          {expanded ? "Hide" : "View"} duplicate{matches.length === 1 ? "" : "s"}
        </button>
        {expanded && <DuplicateList matches={matches} onSelectContact={onSelectContact} />}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
      <p className="leading-relaxed">
        {matches.length === 1 ? (
          <>
            Another contact already has {duplicateReasonLabel(matches[0]!.reasons)}. You can still save this entry, merge
            into one contact, or review the match below.
          </>
        ) : (
          <>
            {matches.length} other contacts may share this email or phone. You can save anyway, merge them together, or
            review each match.
          </>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onOkayWithDuplicates && (
          <button
            type="button"
            onClick={onOkayWithDuplicates}
            className="rounded-lg border border-amber-300/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100/60"
          >
            I&apos;m okay with this
          </button>
        )}
        {onMergeContacts && (
          <button
            type="button"
            onClick={onMergeContacts}
            className="rounded-lg bg-amber-900 px-2.5 py-1 text-[11px] font-semibold text-amber-50 hover:bg-amber-950"
          >
            Merge contacts
          </button>
        )}
        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded-lg px-1 py-1 font-medium text-amber-900 underline decoration-amber-400/80 underline-offset-2 hover:text-amber-950"
        >
          {expanded ? "Hide" : "View"} duplicate{matches.length === 1 ? "" : "s"}
        </button>
      </div>
      {expanded && <DuplicateList matches={matches} onSelectContact={onSelectContact} />}
    </div>
  );
}
