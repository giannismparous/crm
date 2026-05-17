import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ContactReminder, ContactStage, SalesContact } from "../types";
import {
  contactDisplayName,
  findContactDuplicates,
  readDuplicateAcknowledged,
  uniqueCompanySuggestions,
  writeDuplicateAcknowledged,
} from "../utils/contactDuplicates";
import { nextOpenReminderMs, urgencyLabel } from "../utils/salesUrgency";
import { CompanySuggestInput } from "./CompanySuggestInput";
import { ContactDuplicateNotice } from "./ContactDuplicateNotice";
import { ContactMergePanel } from "./ContactMergePanel";
import {
  collectMergeReminders,
  draftToMergeSnapshot,
  mergeFormToContactPayload,
  salesContactToMergeSnapshot,
  type MergeFormValues,
  type MergeSourceSnapshot,
} from "../utils/contactMerge";

const STAGE_LABEL: Record<ContactStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  customer: "Customer",
  churned: "Churned",
};

const STAGE_STYLES: Record<ContactStage, string> = {
  lead: "bg-slate-100 text-slate-800 ring-slate-200",
  qualified: "bg-indigo-50 text-indigo-900 ring-indigo-200",
  proposal: "bg-amber-50 text-amber-950 ring-amber-200",
  negotiation: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  customer: "bg-teal-50 text-teal-900 ring-teal-200",
  churned: "bg-rose-50 text-rose-900 ring-rose-200",
};

type NewContactDraft = {
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  email: string;
  phone: string;
  website: string;
  stage: ContactStage;
  estimatedValue: string;
  currency: string;
  lastContactedAt: string;
  generalNotes: string;
};

function emptyNewContactDraft(): NewContactDraft {
  return {
    firstName: "",
    lastName: "",
    company: "",
    jobTitle: "",
    email: "",
    phone: "",
    website: "",
    stage: "lead",
    estimatedValue: "0",
    currency: "EUR",
    lastContactedAt: new Date().toISOString().slice(0, 16),
    generalNotes: "",
  };
}

export function ContactsTab({
  contacts,
  onAddContact,
  onUpdateContact,
  onRemoveContact,
  onAddReminder,
  onUpdateReminder,
  onRemoveReminder,
  focusContactId,
  onFocusContactHandled,
}: {
  contacts: SalesContact[];
  onAddContact: (c: Omit<SalesContact, "id">) => Promise<string>;
  onUpdateContact: (id: string, patch: Partial<SalesContact>) => Promise<void>;
  onRemoveContact: (id: string) => Promise<void>;
  onAddReminder: (contactId: string, r: Omit<ContactReminder, "id" | "done">) => Promise<void>;
  onUpdateReminder: (contactId: string, reminderId: string, patch: Partial<ContactReminder>) => Promise<void>;
  onRemoveReminder: (contactId: string, reminderId: string) => Promise<void>;
  focusContactId?: string | null;
  onFocusContactHandled?: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newContactDraft, setNewContactDraft] = useState(emptyNewContactDraft);
  const contactRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (!q) return true;
      const blob = `${c.firstName} ${c.lastName} ${c.company} ${c.email} ${c.jobTitle}`.toLowerCase();
      return blob.includes(q);
    });
  }, [contacts, query]);

  const sortedList = useMemo(() => {
    const list = [...filteredList];
    list.sort((a, b) => {
      const ta = nextOpenReminderMs(a);
      const tb = nextOpenReminderMs(b);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    });
    return list;
  }, [filteredList]);

  useEffect(() => {
    if (!selectedId) return;
    if (!sortedList.some((c) => c.id === selectedId)) {
      setSelectedId("");
    }
  }, [sortedList, selectedId]);

  useEffect(() => {
    if (!focusContactId) return;
    if (!contacts.some((c) => c.id === focusContactId)) return;
    setShowForm(false);
    setSelectedId(focusContactId);
    const t = window.setTimeout(() => {
      contactRefs.current[focusContactId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      onFocusContactHandled?.();
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusContactId, contacts, onFocusContactHandled]);

  const selected = useMemo(() => {
    if (!selectedId) return undefined;
    return sortedList.find((c) => c.id === selectedId);
  }, [sortedList, selectedId]);

  const pendingReminders = useMemo(
    () => contacts.reduce((n, c) => n + c.reminders.filter((r) => !r.done).length, 0),
    [contacts]
  );

  const companySuggestions = useMemo(() => uniqueCompanySuggestions(contacts), [contacts]);

  async function addContact(payload: Omit<SalesContact, "id">) {
    const id = await onAddContact(payload);
    setSelectedId(id);
    setShowForm(false);
    setNewContactDraft(emptyNewContactDraft());
  }

  async function finishMergeCreate(values: MergeFormValues, sources: MergeSourceSnapshot[], deleteIds: string[]) {
    const payload = mergeFormToContactPayload(values);
    const reminders = collectMergeReminders(sources);
    const id = await onAddContact({ ...payload, reminders: [] });
    for (const r of reminders) {
      await onAddReminder(id, r);
    }
    for (const deleteId of deleteIds) {
      await onRemoveContact(deleteId);
    }
    setSelectedId(id);
    setShowForm(false);
    setNewContactDraft(emptyNewContactDraft());
  }

  async function finishMergeUpdate(
    keeperId: string,
    values: MergeFormValues,
    sources: MergeSourceSnapshot[],
    deleteIds: string[]
  ) {
    const payload = mergeFormToContactPayload(values);
    await onUpdateContact(keeperId, payload);
    const keeper = contacts.find((c) => c.id === keeperId);
    const existingKeys = new Set(
      (keeper?.reminders ?? []).map((r) => `${r.title.trim().toLowerCase()}|${r.dueAt}|${r.notes.trim().toLowerCase()}`)
    );
    for (const source of sources) {
      if (source.id === keeperId) continue;
      for (const r of source.reminders) {
        const key = `${r.title.trim().toLowerCase()}|${r.dueAt}|${r.notes.trim().toLowerCase()}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        await onAddReminder(keeperId, { title: r.title, dueAt: r.dueAt, notes: r.notes });
      }
    }
    for (const deleteId of deleteIds) {
      if (deleteId === keeperId) continue;
      await onRemoveContact(deleteId);
    }
    setSelectedId(keeperId);
  }

  function patchNewContactDraft(patch: Partial<NewContactDraft>) {
    setNewContactDraft((d) => ({ ...d, ...patch }));
  }

  function updateContact(id: string, patch: Partial<SalesContact>) {
    void onUpdateContact(id, patch).catch(console.error);
  }

  async function removeContact(id: string) {
    await onRemoveContact(id);
    if (id === selectedId) setSelectedId("");
  }

  function addReminder(contactId: string, r: Omit<ContactReminder, "id" | "done">) {
    return onAddReminder(contactId, r);
  }

  function updateReminder(contactId: string, reminderId: string, patch: Partial<ContactReminder>) {
    return onUpdateReminder(contactId, reminderId, patch);
  }

  function removeReminder(contactId: string, reminderId: string) {
    void onRemoveReminder(contactId, reminderId).catch(console.error);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
      <aside className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">Sales</h2>
            <div
              className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-tight text-slate-500 sm:gap-x-2 sm:text-xs"
              aria-label="Contacts summary"
            >
              <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                <span className="tabular-nums font-semibold text-emerald-700">{contacts.length}</span>
                <span className="font-normal">Contacts</span>
              </span>
              {query.trim() && filteredList.length !== contacts.length && (
                <>
                  <span className="px-0.5 text-slate-300" aria-hidden>
                    |
                  </span>
                  <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-slate-600">{filteredList.length}</span>
                    <span className="font-normal">shown</span>
                  </span>
                </>
              )}
              <span className="px-0.5 text-slate-300" aria-hidden>
                |
              </span>
              <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
                <span className="tabular-nums font-semibold text-amber-800">{pendingReminders}</span>
                <span className="font-normal">Reminders</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowForm((open) => {
                if (open) return false;
                setSelectedId("");
                return true;
              });
            }}
            className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
          >
            {showForm ? "Close" : "Add"}
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="input-base py-2 text-sm"
        />

        <ul className="space-y-1.5">
          {sortedList.map((c) => {
            const active = selectedId === c.id;
            const hint = urgencyLabel(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  ref={(el) => {
                    contactRefs.current[c.id] = el;
                  }}
                  onClick={() => {
                    setShowForm(false);
                    setSelectedId(c.id);
                  }}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-indigo-300 bg-indigo-50/90 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {c.firstName} {c.lastName}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1 ring-inset ${STAGE_STYLES[c.stage]}`}
                    >
                      {STAGE_LABEL[c.stage]}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{c.company}</p>
                  {hint && <p className="mt-0.5 text-[11px] font-medium text-slate-600">{hint}</p>}
                </button>
              </li>
            );
          })}
        </ul>

        {sortedList.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
            No matches.
          </p>
        )}
      </aside>

      {showForm ? (
        <NewContactForm
          draft={newContactDraft}
          onDraftChange={patchNewContactDraft}
          contacts={contacts}
          companySuggestions={companySuggestions}
          onSubmit={(c) => void addContact(c)}
          onCancel={() => setShowForm(false)}
          onSelectExisting={(id) => {
            setSelectedId(id);
            setShowForm(false);
          }}
          onMergeComplete={(values, sources, deleteIds) =>
            void finishMergeCreate(values, sources, deleteIds).catch(console.error)
          }
        />
      ) : selected ? (
        <ContactDetail
          contact={selected}
          allContacts={contacts}
          companySuggestions={companySuggestions}
          onSelectContact={setSelectedId}
          onChange={(patch) => updateContact(selected.id, patch)}
          onDelete={() => void removeContact(selected.id)}
          onAddReminder={(r) => addReminder(selected.id, r)}
          onUpdateReminder={(rid, patch) => updateReminder(selected.id, rid, patch)}
          onRemoveReminder={(rid) => removeReminder(selected.id, rid)}
          onMergeComplete={(values, sources, deleteIds) =>
            void finishMergeUpdate(selected.id, values, sources, deleteIds).catch(console.error)
          }
        />
      ) : (
        <div
          className="flex min-h-[min(420px,55vh)] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center"
          aria-label="No contact selected"
        >
          <p className="text-sm font-medium text-slate-700">No contact selected</p>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
            Pick a contact from the list to view and edit details, or use Add to create one.
          </p>
        </div>
      )}
    </div>
  );
}

function NewContactForm({
  draft,
  onDraftChange,
  contacts,
  companySuggestions,
  onSubmit,
  onCancel,
  onSelectExisting,
  onMergeComplete,
}: {
  draft: NewContactDraft;
  onDraftChange: (patch: Partial<NewContactDraft>) => void;
  contacts: SalesContact[];
  companySuggestions: string[];
  onSubmit: (c: Omit<SalesContact, "id">) => void | Promise<void>;
  onCancel: () => void;
  onSelectExisting: (contactId: string) => void;
  onMergeComplete: (
    values: MergeFormValues,
    sources: MergeSourceSnapshot[],
    deleteContactIds: string[]
  ) => void;
}) {
  const [duplicatesExpanded, setDuplicatesExpanded] = useState(false);
  const [duplicatesOkay, setDuplicatesOkay] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);

  const duplicateMatches = useMemo(
    () => findContactDuplicates(contacts, { email: draft.email, phone: draft.phone }),
    [contacts, draft.email, draft.phone]
  );

  const mergeSources = useMemo(
    () => [
      draftToMergeSnapshot(draft),
      ...duplicateMatches.map((m) =>
        salesContactToMergeSnapshot(m.contact, contactDisplayName(m.contact))
      ),
    ],
    [draft, duplicateMatches]
  );

  useEffect(() => {
    setDuplicatesOkay(readDuplicateAcknowledged("new", draft.email, draft.phone));
    setDuplicatesExpanded(false);
    setMergeMode(false);
  }, [draft.email, draft.phone]);

  function acknowledgeDuplicates() {
    writeDuplicateAcknowledged("new", draft.email, draft.phone);
    setDuplicatesOkay(true);
    setDuplicatesExpanded(false);
  }

  if (mergeMode && duplicateMatches.length > 0) {
    return (
      <ContactMergePanel
        sources={mergeSources}
        companySuggestions={companySuggestions}
        onConfirm={(values) => {
          onMergeComplete(
            values,
            mergeSources,
            duplicateMatches.map((m) => m.contact.id)
          );
          setMergeMode(false);
        }}
        onCancel={() => setMergeMode(false)}
      />
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.firstName.trim() || !draft.lastName.trim()) return;
    await onSubmit({
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      company: draft.company.trim(),
      jobTitle: draft.jobTitle.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      website: draft.website.trim(),
      stage: draft.stage,
      estimatedValue: Number(draft.estimatedValue) || 0,
      currency: draft.currency,
      lastContactedAt: new Date(draft.lastContactedAt).toISOString(),
      generalNotes: draft.generalNotes.trim(),
      reminders: [],
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="border-b border-slate-100 pb-4">
        <h3 className="font-display text-xl font-semibold text-slate-900">New contact</h3>
        <p className="mt-1 text-sm text-slate-500">Fill in details and save when ready.</p>
      </header>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="First name">
            <input
              required
              value={draft.firstName}
              onChange={(e) => onDraftChange({ firstName: e.target.value })}
              className="input-base"
            />
          </Labeled>
          <Labeled label="Last name">
            <input
              required
              value={draft.lastName}
              onChange={(e) => onDraftChange({ lastName: e.target.value })}
              className="input-base"
            />
          </Labeled>
        <Labeled label="Company">
          <CompanySuggestInput
            value={draft.company}
            onChange={(company) => onDraftChange({ company })}
            suggestions={companySuggestions}
            className="input-base"
          />
        </Labeled>
        <Labeled label="Job title">
          <input
            value={draft.jobTitle}
            onChange={(e) => onDraftChange({ jobTitle: e.target.value })}
            className="input-base"
          />
        </Labeled>
        <Labeled label="Email">
          <input
            type="email"
            value={draft.email}
            onChange={(e) => onDraftChange({ email: e.target.value })}
            className="input-base"
          />
        </Labeled>
        <Labeled label="Phone">
          <input
            value={draft.phone}
            onChange={(e) => onDraftChange({ phone: e.target.value })}
            className="input-base"
          />
        </Labeled>
        {duplicateMatches.length > 0 && (
          <div className="sm:col-span-2">
            <ContactDuplicateNotice
              matches={duplicateMatches}
              expanded={duplicatesExpanded}
              acknowledged={duplicatesOkay}
              onToggleExpanded={() => setDuplicatesExpanded((v) => !v)}
              onSelectContact={onSelectExisting}
              onOkayWithDuplicates={acknowledgeDuplicates}
              onMergeContacts={() => setMergeMode(true)}
            />
          </div>
        )}
        <Labeled label="Website" className="sm:col-span-2">
          <input
            value={draft.website}
            onChange={(e) => onDraftChange({ website: e.target.value })}
            className="input-base"
            placeholder="https://"
          />
        </Labeled>
        <Labeled label="Stage">
          <select
            value={draft.stage}
            onChange={(e) => onDraftChange({ stage: e.target.value as ContactStage })}
            className="input-base"
          >
            {(Object.keys(STAGE_LABEL) as ContactStage[]).map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Est. deal value">
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="100"
              value={draft.estimatedValue}
              onChange={(e) => onDraftChange({ estimatedValue: e.target.value })}
              className="input-base min-w-0 flex-1"
            />
            <select
              value={draft.currency}
              onChange={(e) => onDraftChange({ currency: e.target.value })}
              className="input-base w-24"
            >
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
            </select>
          </div>
        </Labeled>
        <Labeled label="Last contacted">
          <input
            type="datetime-local"
            value={draft.lastContactedAt}
            onChange={(e) => onDraftChange({ lastContactedAt: e.target.value })}
            className="input-base"
          />
        </Labeled>
        </div>

        <Labeled label="General notes (relationship & context)">
          <textarea
            value={draft.generalNotes}
            onChange={(e) => onDraftChange({ generalNotes: e.target.value })}
            rows={5}
            className="input-base min-h-[120px] resize-y"
            placeholder="What they care about, stakeholders, risks, promised follow-ups…"
          />
        </Labeled>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
          >
            Save contact
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
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

function ContactDetail({
  contact,
  allContacts,
  companySuggestions,
  onSelectContact,
  onChange,
  onDelete,
  onAddReminder,
  onUpdateReminder,
  onRemoveReminder,
  onMergeComplete,
}: {
  contact: SalesContact;
  allContacts: SalesContact[];
  companySuggestions: string[];
  onSelectContact: (contactId: string) => void;
  onChange: (patch: Partial<SalesContact>) => void;
  onDelete: () => void;
  onAddReminder: (r: Omit<ContactReminder, "id" | "done">) => void | Promise<void>;
  onUpdateReminder: (id: string, patch: Partial<ContactReminder>) => void | Promise<void>;
  onRemoveReminder: (id: string) => void;
  onMergeComplete: (
    values: MergeFormValues,
    sources: MergeSourceSnapshot[],
    deleteContactIds: string[]
  ) => void;
}) {
  const [rTitle, setRTitle] = useState("");
  const [rDue, setRDue] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [rNotes, setRNotes] = useState("");
  const [duplicatesExpanded, setDuplicatesExpanded] = useState(false);
  const [duplicatesOkay, setDuplicatesOkay] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);

  const duplicateMatches = useMemo(
    () => findContactDuplicates(allContacts, { email: contact.email, phone: contact.phone }, contact.id),
    [allContacts, contact.email, contact.phone, contact.id]
  );

  const mergeSources = useMemo(
    () => [
      salesContactToMergeSnapshot(contact, "This contact"),
      ...duplicateMatches.map((m) =>
        salesContactToMergeSnapshot(m.contact, contactDisplayName(m.contact))
      ),
    ],
    [contact, duplicateMatches]
  );

  const duplicateAckScope = `contact:${contact.id}`;

  useEffect(() => {
    setDuplicatesOkay(readDuplicateAcknowledged(duplicateAckScope, contact.email, contact.phone));
    setDuplicatesExpanded(false);
    setMergeMode(false);
  }, [duplicateAckScope, contact.email, contact.phone]);

  function acknowledgeDuplicates() {
    writeDuplicateAcknowledged(duplicateAckScope, contact.email, contact.phone);
    setDuplicatesOkay(true);
    setDuplicatesExpanded(false);
  }

  const lastContactLocal = useMemo(() => {
    try {
      const d = new Date(contact.lastContactedAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  }, [contact.lastContactedAt]);

  const showMergePanel = mergeMode && duplicateMatches.length > 0;

  async function submitReminder(e: FormEvent) {
    e.preventDefault();
    if (!rTitle.trim()) return;
    try {
      await onAddReminder({
        title: rTitle.trim(),
        dueAt: new Date(rDue).toISOString(),
        notes: rNotes.trim(),
      });
      setRTitle("");
      setRNotes("");
      setRDue(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    } catch (err) {
      console.error(err);
    }
  }

  if (showMergePanel) {
    return (
      <ContactMergePanel
        sources={mergeSources}
        companySuggestions={companySuggestions}
        onConfirm={(values) => {
          onMergeComplete(values, mergeSources, duplicateMatches.map((m) => m.contact.id));
          setMergeMode(false);
        }}
        onCancel={() => setMergeMode(false)}
      />
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-display text-xl font-semibold text-slate-900">
            {contact.firstName} {contact.lastName}
          </h3>
          <p className="text-sm text-slate-600">{contact.company}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${STAGE_STYLES[contact.stage]}`}
          >
            {STAGE_LABEL[contact.stage]}
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="First name">
          <input
            value={contact.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            className="input-base"
          />
        </Labeled>
        <Labeled label="Last name">
          <input
            value={contact.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            className="input-base"
          />
        </Labeled>
        <Labeled label="Company">
          <CompanySuggestInput
            value={contact.company}
            onChange={(company) => onChange({ company })}
            suggestions={companySuggestions}
            className="input-base"
          />
        </Labeled>
        <Labeled label="Job title">
          <input value={contact.jobTitle} onChange={(e) => onChange({ jobTitle: e.target.value })} className="input-base" />
        </Labeled>
        <Labeled label="Email">
          <input type="email" value={contact.email} onChange={(e) => onChange({ email: e.target.value })} className="input-base" />
        </Labeled>
        <Labeled label="Phone">
          <input value={contact.phone} onChange={(e) => onChange({ phone: e.target.value })} className="input-base" />
        </Labeled>
        {duplicateMatches.length > 0 && (
          <div className="sm:col-span-2">
            <ContactDuplicateNotice
              matches={duplicateMatches}
              expanded={duplicatesExpanded}
              acknowledged={duplicatesOkay}
              onToggleExpanded={() => setDuplicatesExpanded((v) => !v)}
              onSelectContact={onSelectContact}
              onOkayWithDuplicates={acknowledgeDuplicates}
              onMergeContacts={() => setMergeMode(true)}
            />
          </div>
        )}
        <Labeled label="Website" className="sm:col-span-2">
          <input value={contact.website} onChange={(e) => onChange({ website: e.target.value })} className="input-base" />
        </Labeled>
        <Labeled label="Stage">
          <select
            value={contact.stage}
            onChange={(e) => onChange({ stage: e.target.value as ContactStage })}
            className="input-base"
          >
            {(Object.keys(STAGE_LABEL) as ContactStage[]).map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Est. deal value">
          <input
            type="number"
            min={0}
            value={contact.estimatedValue}
            onChange={(e) => onChange({ estimatedValue: Number(e.target.value) || 0 })}
            className="input-base"
          />
        </Labeled>
        <Labeled label="Currency">
          <select
            value={contact.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
            className="input-base"
          >
            <option>EUR</option>
            <option>USD</option>
            <option>GBP</option>
          </select>
        </Labeled>
        <Labeled label="Last contacted">
          <input
            type="datetime-local"
            value={lastContactLocal}
            onChange={(e) => onChange({ lastContactedAt: new Date(e.target.value).toISOString() })}
            className="input-base"
          />
        </Labeled>
      </div>

      <Labeled label="General notes (relationship & context)" className="mb-8">
        <textarea
          value={contact.generalNotes}
          onChange={(e) => onChange({ generalNotes: e.target.value })}
          rows={5}
          className="input-base min-h-[120px] resize-y"
          placeholder="What they care about, stakeholders, risks, promised follow-ups…"
        />
      </Labeled>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <h4 className="text-sm font-semibold text-slate-900">Reminders</h4>

        <form onSubmit={submitReminder} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
          <Labeled label="What to do next">
            <input
              value={rTitle}
              onChange={(e) => setRTitle(e.target.value)}
              className="input-base py-2 text-sm"
              placeholder="e.g. Send proposal"
              required
            />
          </Labeled>
          <Labeled label="Due">
            <input
              type="datetime-local"
              value={rDue}
              onChange={(e) => setRDue(e.target.value)}
              className="input-base py-2 text-sm sm:max-w-[240px]"
            />
          </Labeled>
          <Labeled label="Short notes">
            <textarea
              value={rNotes}
              onChange={(e) => setRNotes(e.target.value)}
              rows={3}
              className="input-base min-h-[72px] resize-y py-2 text-sm"
              placeholder="Optional context for this follow-up…"
            />
          </Labeled>
          <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
            Add reminder
          </button>
        </form>

        <ul className="mt-4 space-y-3">
          {contact.reminders.map((r) => {
            const due = new Date(r.dueAt);
            const overdue = !r.done && due.getTime() < Date.now();
            return (
              <li
                key={r.id}
                className={`rounded-xl border px-4 py-3 ${
                  r.done ? "border-slate-100 bg-slate-50/80 opacity-75" : "border-slate-200 bg-white shadow-sm"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      value={r.title}
                      onChange={(e) => onUpdateReminder(r.id, { title: e.target.value })}
                      className="w-full bg-transparent font-medium text-slate-900 outline-none"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Due {due.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      {overdue && <span className="ml-2 font-semibold text-rose-700">Overdue</span>}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={r.done}
                      onChange={(e) => {
                        void Promise.resolve(onUpdateReminder(r.id, { done: e.target.checked })).catch(
                          console.error
                        );
                      }}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    Done
                  </label>
                </div>
                <label className="mt-2 block">
                  <span className="mb-1 block text-[10px] font-medium text-slate-500">Short notes</span>
                  <textarea
                    value={r.notes}
                    onChange={(e) => onUpdateReminder(r.id, { notes: e.target.value })}
                    rows={3}
                    className="input-base min-h-[72px] resize-y text-xs"
                    placeholder="Optional context for this follow-up…"
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                  <label className="flex items-center gap-1 text-slate-500">
                    Adjust due
                    <input
                      type="datetime-local"
                      value={toLocalInput(r.dueAt)}
                      onChange={(e) => onUpdateReminder(r.id, { dueAt: new Date(e.target.value).toISOString() })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onRemoveReminder(r.id)}
                    className="text-sm font-medium text-rose-700 hover:text-rose-900 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {contact.reminders.length === 0 && (
          <p className="mt-3 text-center text-xs text-slate-500">No reminders yet — add your first follow-up above.</p>
        )}
      </div>
    </section>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
