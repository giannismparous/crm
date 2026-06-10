import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import { usePersistedFormDraft } from "../hooks/usePersistedFormDraft";
import { clearFormDraft, isShallowDraftEmpty, readFormDraft } from "../utils/formDraftStorage";
import { ChevronDown } from "lucide-react";
import type { ContactReminder, ContactStage, ImageAttachment, SalesContact } from "../types";
import { newContactDocId, newContactReminderDocId } from "../firebase/firestoreIds";
import { deleteImagesFromStorage } from "../utils/imageAttachments";
import { storagePathsInUpdatesHtml } from "../utils/richTextImages";
import { sanitizeTaskUpdates } from "../utils/sanitizeRichText";
import { ImageAttachmentGallery } from "./ImageAttachmentGallery";
import { InlineImageAttachments } from "./InlineImageAttachments";
import { SimpleRichText } from "./SimpleRichText";
import {
  contactDisplayName,
  findContactDuplicates,
  readDuplicateAcknowledged,
  uniqueCompanySuggestions,
  writeDuplicateAcknowledged,
} from "../utils/contactDuplicates";
import { isReminderOverdue, nextOpenReminderMs, urgencyLabel } from "../utils/salesUrgency";
import { CompanySuggestInput } from "./CompanySuggestInput";
import { ContactDuplicateNotice } from "./ContactDuplicateNotice";
import { ContactMergePanel } from "./ContactMergePanel";
import {
  collectMergeReminders,
  contactHasSaveableIdentity,
  draftToMergeSnapshot,
  lastContactedAtFromLocal,
  mergeFormToContactPayload,
  normalizeContactIdentity,
  toDatetimeLocalValue,
  salesContactToMergeSnapshot,
  type MergeFormValues,
  type MergeSourceSnapshot,
} from "../utils/contactMerge";
import { datetimeLocalToIso, defaultOrgDatetimeLocal, formatInOrgTime } from "../utils/orgTimezone";

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
    lastContactedAt: "",
    generalNotes: "",
  };
}

const CONTACTS_NEW_DRAFT_KEY = "contacts:new";

function isNewContactDraftEmpty(draft: NewContactDraft): boolean {
  return isShallowDraftEmpty(draft as unknown as Record<string, unknown>);
}

const CONTACTS_VIEW_DEFAULTS = {
  query: "",
  selectedId: "",
};

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
  onAddContact: (c: Omit<SalesContact, "id">, contactId?: string) => Promise<string>;
  onUpdateContact: (id: string, patch: Partial<SalesContact>) => Promise<void>;
  onRemoveContact: (id: string) => Promise<void>;
  onAddReminder: (
    contactId: string,
    r: Omit<ContactReminder, "id" | "done">,
    reminderId?: string
  ) => Promise<void>;
  onUpdateReminder: (contactId: string, reminderId: string, patch: Partial<ContactReminder>) => Promise<void>;
  onRemoveReminder: (contactId: string, reminderId: string) => Promise<void>;
  focusContactId?: string | null;
  onFocusContactHandled?: () => void;
}) {
  const saved = useMemo(() => readPersistedTabState("contacts", CONTACTS_VIEW_DEFAULTS), []);
  const savedNewForm = useMemo(() => readFormDraft<NewContactDraft>(CONTACTS_NEW_DRAFT_KEY), []);
  const [selectedId, setSelectedId] = useState(() => saved.selectedId);
  const [query, setQuery] = useState(() => saved.query);
  const [showForm, setShowForm] = useState(() => Boolean(savedNewForm?.open));
  const [newContactDraft, setNewContactDraft] = useState(() =>
    savedNewForm?.data ? { ...savedNewForm.data } : emptyNewContactDraft()
  );
  const [newContactDraftId, setNewContactDraftId] = useState(newContactDocId);
  const contactRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  usePersistedTabState("contacts", { query, selectedId });

  usePersistedFormDraft(
    CONTACTS_NEW_DRAFT_KEY,
    { open: showForm, data: newContactDraft },
    { isEmpty: isNewContactDraftEmpty }
  );

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
    const id = await onAddContact(payload, newContactDraftId);
    clearFormDraft(CONTACTS_NEW_DRAFT_KEY);
    setSelectedId(id);
    setShowForm(false);
    setNewContactDraft(emptyNewContactDraft());
    setNewContactDraftId(newContactDocId());
  }

  function discardNewContactDraft() {
    const paths = storagePathsInUpdatesHtml(newContactDraft.generalNotes);
    if (paths.length > 0) void deleteImagesFromStorage(paths);
    clearFormDraft(CONTACTS_NEW_DRAFT_KEY);
    setNewContactDraft(emptyNewContactDraft());
    setNewContactDraftId(newContactDocId());
  }

  function openNewContactForm() {
    setSelectedId("");
    setNewContactDraft(emptyNewContactDraft());
    setNewContactDraftId(newContactDocId());
    setShowForm(true);
  }

  function closeNewContactForm() {
    discardNewContactDraft();
    setShowForm(false);
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
    clearFormDraft(CONTACTS_NEW_DRAFT_KEY);
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

  function addReminder(
    contactId: string,
    r: Omit<ContactReminder, "id" | "done">,
    reminderId?: string
  ) {
    return onAddReminder(contactId, r, reminderId);
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
          {!showForm && (
            <button
              type="button"
              onClick={openNewContactForm}
              className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
            >
              Add
            </button>
          )}
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
          draftContactId={newContactDraftId}
          onDraftChange={patchNewContactDraft}
          contacts={contacts}
          companySuggestions={companySuggestions}
          onSubmit={(c) => void addContact(c)}
          onCancel={closeNewContactForm}
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
          onAddReminder={(r, reminderId) => addReminder(selected.id, r, reminderId)}
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
  draftContactId,
  onDraftChange,
  contacts,
  companySuggestions,
  onSubmit,
  onCancel,
  onSelectExisting,
  onMergeComplete,
}: {
  draft: NewContactDraft;
  draftContactId: string;
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

  const canSave = contactHasSaveableIdentity(draft.firstName, draft.lastName, draft.company);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const identity = normalizeContactIdentity({
      firstName: draft.firstName,
      lastName: draft.lastName,
      company: draft.company,
    });
    if (!identity) return;
    await onSubmit({
      firstName: identity.firstName,
      lastName: identity.lastName,
      company: identity.company,
      jobTitle: draft.jobTitle.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      website: draft.website.trim(),
      stage: draft.stage,
      estimatedValue: Number(draft.estimatedValue) || 0,
      currency: draft.currency,
      lastContactedAt: lastContactedAtFromLocal(draft.lastContactedAt),
      generalNotes: sanitizeTaskUpdates(draft.generalNotes.trim()),
      reminders: [],
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-display text-xl font-semibold text-slate-900">New contact</h3>
          <p className="mt-1 text-sm text-slate-500">Fill in details and save when ready.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </header>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="First name">
            <input
              value={draft.firstName}
              onChange={(e) => onDraftChange({ firstName: e.target.value })}
              className="input-base"
            />
          </Labeled>
          <Labeled label="Last name">
            <input
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

        <Labeled label="Notes">
          <SimpleRichText
            value={draft.generalNotes}
            onChange={(html) => onDraftChange({ generalNotes: html })}
            placeholder="What they care about, stakeholders, risks, promised follow-ups…"
            collapseKey={`new-contact-notes-${draftContactId}`}
            inlineImageStorageDir={`contacts/${draftContactId}/notes`}
          />
        </Labeled>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save contact
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

function ReminderCard({
  reminder: r,
  contactId,
  editing,
  reminderUploading,
  onUpdateReminder,
  onRemoveReminder,
  onStartEdit,
  onStopEdit,
  setReminderUploading,
}: {
  reminder: ContactReminder;
  contactId: string;
  editing: boolean;
  reminderUploading: string | null;
  onUpdateReminder: (id: string, patch: Partial<ContactReminder>) => void | Promise<void>;
  onRemoveReminder: (id: string) => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  setReminderUploading: (id: string | null) => void;
}) {
  const due = new Date(r.dueAt);
  const overdue = isReminderOverdue(r.dueAt, r.done);

  if (r.done) {
    return (
      <li className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 opacity-90">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-800">{r.title}</p>
            <p className="mt-1 text-xs text-slate-500">
              Due {formatInOrgTime(due, { dateStyle: "medium", timeStyle: "short" })}
              <span className="ml-2 font-medium text-emerald-700">Done</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void Promise.resolve(onUpdateReminder(r.id, { done: false })).catch(console.error);
            }}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
          >
            Reopen
          </button>
        </div>
        {r.notes.trim() && (
          <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{r.notes}</p>
        )}
        <ImageAttachmentGallery
          scopeKey={`reminder-done-${contactId}-${r.id}`}
          attachments={r.attachments}
          size="sm"
        />
      </li>
    );
  }

  if (!editing) {
    return (
      <li className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{r.title}</p>
            <p className="mt-1 text-xs text-slate-500">
              Due {formatInOrgTime(due, { dateStyle: "medium", timeStyle: "short" })}
              {overdue && <span className="ml-2 font-semibold text-rose-700">Overdue</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onStartEdit}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
            >
              Edit
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={r.done}
                onChange={(e) => {
                  if (e.target.checked) onStopEdit();
                  void Promise.resolve(onUpdateReminder(r.id, { done: e.target.checked })).catch(
                    console.error
                  );
                }}
                className="rounded border-slate-300 text-accent focus:ring-accent/30"
              />
              Done
            </label>
          </div>
        </div>
        {r.notes.trim() && (
          <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{r.notes}</p>
        )}
        <ImageAttachmentGallery
          scopeKey={`reminder-open-${contactId}-${r.id}`}
          attachments={r.attachments}
          size="sm"
        />
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-accent/30 bg-white px-4 py-3 shadow-sm ring-1 ring-accent/15">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={r.title}
            onChange={(e) => onUpdateReminder(r.id, { title: e.target.value })}
            className="w-full bg-transparent font-medium text-slate-900 outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            Due {formatInOrgTime(due, { dateStyle: "medium", timeStyle: "short" })}
            {overdue && <span className="ml-2 font-semibold text-rose-700">Overdue</span>}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={r.done}
            onChange={(e) => {
              if (e.target.checked) onStopEdit();
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
      <div className="relative mt-2 min-h-[1.75rem]">
        <InlineImageAttachments
          storageDir={`contacts/${contactId}/reminders/${r.id}`}
          attachments={r.attachments ?? []}
          onAttachmentsChange={(attachments) => {
            void Promise.resolve(onUpdateReminder(r.id, { attachments })).catch(console.error);
          }}
          onUploadingChange={(uploading) => setReminderUploading(uploading ? r.id : null)}
          disabled={reminderUploading === r.id}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
        <label className="flex items-center gap-1 text-slate-500">
          Adjust due
          <input
            type="datetime-local"
            value={toLocalInput(r.dueAt)}
            onChange={(e) =>
              onUpdateReminder(r.id, { dueAt: datetimeLocalToIso(e.target.value) })
            }
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            onRemoveReminder(r.id);
            onStopEdit();
          }}
          className="text-sm font-medium text-rose-700 hover:text-rose-900 hover:underline"
        >
          Remove
        </button>
        <button
          type="button"
          onClick={onStopEdit}
          className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Done editing
        </button>
      </div>
    </li>
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
  onAddReminder: (
    r: Omit<ContactReminder, "id" | "done">,
    reminderId?: string
  ) => void | Promise<void>;
  onUpdateReminder: (id: string, patch: Partial<ContactReminder>) => void | Promise<void>;
  onRemoveReminder: (id: string) => void;
  onMergeComplete: (
    values: MergeFormValues,
    sources: MergeSourceSnapshot[],
    deleteContactIds: string[]
  ) => void;
}) {
  const [rTitle, setRTitle] = useState("");
  const [rDue, setRDue] = useState(() => defaultOrgDatetimeLocal(24));
  const [rNotes, setRNotes] = useState("");
  const [rDraftReminderId, setRDraftReminderId] = useState(() => newContactReminderDocId(contact.id));
  const [rDraftAttachments, setRDraftAttachments] = useState<ImageAttachment[]>([]);
  const [rDraftImagesUploading, setRDraftImagesUploading] = useState(false);
  const rDraftAttachmentsRef = useRef<ImageAttachment[]>([]);
  const rDraftSubmittedRef = useRef(false);
  rDraftAttachmentsRef.current = rDraftAttachments;
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  const [reminderUploading, setReminderUploading] = useState<string | null>(null);
  const [overdueRemindersOpen, setOverdueRemindersOpen] = useState(false);
  const [doneRemindersOpen, setDoneRemindersOpen] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);

  const { openReminders, overdueReminders, doneReminders } = useMemo(() => {
    const open: ContactReminder[] = [];
    const overdue: ContactReminder[] = [];
    const done: ContactReminder[] = [];
    for (const r of contact.reminders) {
      if (r.done) done.push(r);
      else if (isReminderOverdue(r.dueAt)) overdue.push(r);
      else open.push(r);
    }
    const byDue = (a: ContactReminder, b: ContactReminder) => a.dueAt.localeCompare(b.dueAt);
    open.sort(byDue);
    overdue.sort(byDue);
    done.sort(byDue);
    return { openReminders: open, overdueReminders: overdue, doneReminders: done };
  }, [contact.reminders]);
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

  useEffect(() => {
    rDraftSubmittedRef.current = false;
    setRTitle("");
    setRNotes("");
    setRDraftReminderId(newContactReminderDocId(contact.id));
    setRDraftAttachments([]);
    setRDraftImagesUploading(false);
    setOverdueRemindersOpen(false);
    setDoneRemindersOpen(false);
    setEditingReminderId(null);
    return () => {
      if (rDraftSubmittedRef.current) return;
      const orphans = rDraftAttachmentsRef.current;
      if (orphans.length > 0) {
        void deleteImagesFromStorage(orphans.map((a) => a.storagePath));
      }
    };
  }, [contact.id]);

  function acknowledgeDuplicates() {
    writeDuplicateAcknowledged(duplicateAckScope, contact.email, contact.phone);
    setDuplicatesOkay(true);
    setDuplicatesExpanded(false);
  }

  const lastContactLocal = useMemo(
    () => toDatetimeLocalValue(contact.lastContactedAt),
    [contact.lastContactedAt]
  );

  const showMergePanel = mergeMode && duplicateMatches.length > 0;

  async function submitReminder(e: FormEvent) {
    e.preventDefault();
    if (!rTitle.trim() || reminderSubmitting || rDraftImagesUploading) return;
    setReminderSubmitting(true);
    try {
      await onAddReminder(
        {
          title: rTitle.trim(),
          dueAt: datetimeLocalToIso(rDue),
          notes: rNotes.trim(),
          ...(rDraftAttachments.length > 0 ? { attachments: rDraftAttachments } : {}),
        },
        rDraftReminderId
      );
      rDraftSubmittedRef.current = true;
      setRTitle("");
      setRNotes("");
      setRDraftReminderId(newContactReminderDocId(contact.id));
      setRDraftAttachments([]);
      setRDue(defaultOrgDatetimeLocal(24));
    } catch (err) {
      console.error(err);
    } finally {
      setReminderSubmitting(false);
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
          {contact.company.trim() && (
            <p className="mt-1.5 text-sm text-slate-600">{contact.company}</p>
          )}
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

      <div className="mt-4 grid gap-4 pt-2 sm:mt-5 sm:grid-cols-2 sm:pt-3">
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
            onChange={(e) => onChange({ lastContactedAt: lastContactedAtFromLocal(e.target.value) })}
            className="input-base"
          />
        </Labeled>
      </div>

      <Labeled label="Notes" className="mb-8">
        <SimpleRichText
          value={contact.generalNotes}
          onChange={(html) => onChange({ generalNotes: html })}
          placeholder="What they care about, stakeholders, risks, promised follow-ups…"
          collapseKey={`contact-notes-${contact.id}`}
          inlineImageStorageDir={`contacts/${contact.id}/notes`}
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
            <div className="relative">
              <textarea
                value={rNotes}
                onChange={(e) => setRNotes(e.target.value)}
                rows={3}
                className="input-base min-h-[72px] resize-y py-2 pb-10 text-sm"
                placeholder="Optional context for this follow-up…"
              />
              <InlineImageAttachments
                storageDir={`contacts/${contact.id}/reminders/${rDraftReminderId}`}
                attachments={rDraftAttachments}
                onAttachmentsChange={setRDraftAttachments}
                onUploadingChange={setRDraftImagesUploading}
                disabled={reminderSubmitting}
              />
            </div>
          </Labeled>
          <button
            type="submit"
            disabled={reminderSubmitting || rDraftImagesUploading}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {reminderSubmitting ? "Adding…" : "Add reminder"}
          </button>
        </form>

        {openReminders.length > 0 && (
          <ul className="mt-4 space-y-3">
            {openReminders.map((r) => (
              <ReminderCard
                key={r.id}
                reminder={r}
                contactId={contact.id}
                editing={editingReminderId === r.id}
                reminderUploading={reminderUploading}
                onUpdateReminder={onUpdateReminder}
                onRemoveReminder={onRemoveReminder}
                onStartEdit={() => setEditingReminderId(r.id)}
                onStopEdit={() => setEditingReminderId((id) => (id === r.id ? null : id))}
                setReminderUploading={setReminderUploading}
              />
            ))}
          </ul>
        )}

        {overdueReminders.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setOverdueRemindersOpen((open) => !open)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-rose-200/80 bg-rose-50/50 px-3 py-2 text-left text-xs font-medium text-rose-900/90 hover:border-rose-300 hover:bg-rose-50"
              aria-expanded={overdueRemindersOpen}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-rose-400 transition-transform ${overdueRemindersOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
              <span>Overdue reminders</span>
              <span className="font-normal tabular-nums text-rose-600/80">({overdueReminders.length})</span>
            </button>
            {overdueRemindersOpen && (
              <ul className="mt-2 space-y-3">
                {overdueReminders.map((r) => (
                  <ReminderCard
                    key={r.id}
                    reminder={r}
                    contactId={contact.id}
                    editing={editingReminderId === r.id}
                    reminderUploading={reminderUploading}
                    onUpdateReminder={onUpdateReminder}
                    onRemoveReminder={onRemoveReminder}
                    onStartEdit={() => setEditingReminderId(r.id)}
                    onStopEdit={() => setEditingReminderId((id) => (id === r.id ? null : id))}
                    setReminderUploading={setReminderUploading}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        {doneReminders.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setDoneRemindersOpen((open) => !open)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-white/80 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900"
              aria-expanded={doneRemindersOpen}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${doneRemindersOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
              <span>Done reminders</span>
              <span className="font-normal tabular-nums text-slate-400">({doneReminders.length})</span>
            </button>
            {doneRemindersOpen && (
              <ul className="mt-2 space-y-3">
                {doneReminders.map((r) => (
                  <ReminderCard
                    key={r.id}
                    reminder={r}
                    contactId={contact.id}
                    editing={false}
                    reminderUploading={reminderUploading}
                    onUpdateReminder={onUpdateReminder}
                    onRemoveReminder={onRemoveReminder}
                    onStartEdit={() => undefined}
                    onStopEdit={() => undefined}
                    setReminderUploading={setReminderUploading}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

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
