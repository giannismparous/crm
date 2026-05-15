import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { ContactReminder, ContactStage, SalesContact } from "../types";
import { nextOpenReminderMs, urgencyLabel } from "../utils/salesUrgency";

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

export function ContactsTab({
  contacts,
  onAddContact,
  onUpdateContact,
  onRemoveContact,
  onAddReminder,
  onUpdateReminder,
  onRemoveReminder,
}: {
  contacts: SalesContact[];
  onAddContact: (c: Omit<SalesContact, "id">) => Promise<string>;
  onUpdateContact: (id: string, patch: Partial<SalesContact>) => Promise<void>;
  onRemoveContact: (id: string) => Promise<void>;
  onAddReminder: (contactId: string, r: Omit<ContactReminder, "id" | "done">) => Promise<void>;
  onUpdateReminder: (contactId: string, reminderId: string, patch: Partial<ContactReminder>) => Promise<void>;
  onRemoveReminder: (contactId: string, reminderId: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

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
    if (sortedList.length === 0) {
      setSelectedId("");
      return;
    }
    if (!sortedList.some((c) => c.id === selectedId)) {
      setSelectedId(sortedList[0]!.id);
    }
  }, [sortedList, selectedId]);

  const selected = useMemo(() => {
    return sortedList.find((c) => c.id === selectedId) ?? sortedList[0];
  }, [sortedList, selectedId]);

  async function addContact(payload: Omit<SalesContact, "id">) {
    const id = await onAddContact(payload);
    setSelectedId(id);
    setShowForm(false);
  }

  function updateContact(id: string, patch: Partial<SalesContact>) {
    void onUpdateContact(id, patch).catch(console.error);
  }

  async function removeContact(id: string) {
    await onRemoveContact(id);
    if (id === selectedId) setSelectedId("");
  }

  function addReminder(contactId: string, r: Omit<ContactReminder, "id" | "done">) {
    void onAddReminder(contactId, r).catch(console.error);
  }

  function updateReminder(contactId: string, reminderId: string, patch: Partial<ContactReminder>) {
    void onUpdateReminder(contactId, reminderId, patch).catch(console.error);
  }

  function removeReminder(contactId: string, reminderId: string) {
    void onRemoveReminder(contactId, reminderId).catch(console.error);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
      <aside className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-slate-900">Sales</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
          >
            {showForm ? "Close" : "Add"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Sorted by next open reminder — most urgent first.
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="input-base py-2 text-sm"
        />

        {showForm && <NewContactForm onSubmit={(c) => void addContact(c)} onCancel={() => setShowForm(false)} />}

        <ul className="space-y-1.5">
          {sortedList.map((c) => {
            const active = selected?.id === c.id;
            const hint = urgencyLabel(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
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

      {selected ? (
        <ContactDetail
          contact={selected}
          onChange={(patch) => updateContact(selected.id, patch)}
          onDelete={() => void removeContact(selected.id)}
          onAddReminder={(r) => addReminder(selected.id, r)}
          onUpdateReminder={(rid, patch) => updateReminder(selected.id, rid, patch)}
          onRemoveReminder={(rid) => removeReminder(selected.id, rid)}
        />
      ) : (
        <div className="glass-strong flex min-h-[320px] items-center justify-center rounded-3xl p-8 text-center text-slate-500">
          Select or create a contact to edit details.
        </div>
      )}
    </div>
  );
}

function NewContactForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (c: Omit<SalesContact, "id">) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [stage, setStage] = useState<ContactStage>("lead");
  const [estimatedValue, setEstimatedValue] = useState("0");
  const [currency, setCurrency] = useState("EUR");
  const [lastContactedAt, setLastContactedAt] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [generalNotes, setGeneralNotes] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    await onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company: company.trim(),
      jobTitle: jobTitle.trim(),
      email: email.trim(),
      phone: phone.trim(),
      website: website.trim(),
      stage,
      estimatedValue: Number(estimatedValue) || 0,
      currency,
      lastContactedAt: new Date(lastContactedAt).toISOString(),
      generalNotes: generalNotes.trim(),
      reminders: [],
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <p className="text-sm font-semibold text-slate-900">New contact</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Labeled label="First name">
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input-base py-2" />
        </Labeled>
        <Labeled label="Last name">
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className="input-base py-2" />
        </Labeled>
        <Labeled label="Company" className="sm:col-span-2">
          <input value={company} onChange={(e) => setCompany(e.target.value)} className="input-base py-2" />
        </Labeled>
        <Labeled label="Role">
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="input-base py-2" />
        </Labeled>
        <Labeled label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-base py-2" />
        </Labeled>
        <Labeled label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-base py-2" />
        </Labeled>
        <Labeled label="Website">
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="input-base py-2"
            placeholder="https://"
          />
        </Labeled>
        <Labeled label="Stage">
          <select value={stage} onChange={(e) => setStage(e.target.value as ContactStage)} className="input-base py-2">
            {(Object.keys(STAGE_LABEL) as ContactStage[]).map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Value">
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="100"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              className="input-base min-w-0 flex-1 py-2"
            />
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input-base w-24 py-2">
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
            </select>
          </div>
        </Labeled>
        <Labeled label="Last touch">
          <input
            type="datetime-local"
            value={lastContactedAt}
            onChange={(e) => setLastContactedAt(e.target.value)}
            className="input-base py-2"
          />
        </Labeled>
        <Labeled label="Notes" className="sm:col-span-2">
          <textarea
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            rows={2}
            className="input-base min-h-[72px] resize-y py-2"
            placeholder="Context for the team…"
          />
        </Labeled>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-dim"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </form>
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
  onChange,
  onDelete,
  onAddReminder,
  onUpdateReminder,
  onRemoveReminder,
}: {
  contact: SalesContact;
  onChange: (patch: Partial<SalesContact>) => void;
  onDelete: () => void;
  onAddReminder: (r: Omit<ContactReminder, "id" | "done">) => void;
  onUpdateReminder: (id: string, patch: Partial<ContactReminder>) => void;
  onRemoveReminder: (id: string) => void;
}) {
  const [rTitle, setRTitle] = useState("");
  const [rDue, setRDue] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [rNotes, setRNotes] = useState("");

  const lastContactLocal = useMemo(() => {
    try {
      const d = new Date(contact.lastContactedAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  }, [contact.lastContactedAt]);

  function submitReminder(e: FormEvent) {
    e.preventDefault();
    if (!rTitle.trim()) return;
    onAddReminder({
      title: rTitle.trim(),
      dueAt: new Date(rDue).toISOString(),
      notes: rNotes.trim(),
    });
    setRTitle("");
    setRNotes("");
    setRDue(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
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
          <input value={contact.company} onChange={(e) => onChange({ company: e.target.value })} className="input-base" />
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

      <Labeled label="General notes (relationship & context)">
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

        <form onSubmit={submitReminder} className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <input
            value={rTitle}
            onChange={(e) => setRTitle(e.target.value)}
            className="input-base py-2 text-sm"
            placeholder="What to do next"
            required
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="datetime-local" value={rDue} onChange={(e) => setRDue(e.target.value)} className="input-base py-2 text-sm sm:max-w-[200px]" />
            <input
              value={rNotes}
              onChange={(e) => setRNotes(e.target.value)}
              className="input-base min-w-0 flex-1 py-2 text-sm"
              placeholder="Short note (optional)"
            />
          </div>
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
                      onChange={(e) => onUpdateReminder(r.id, { done: e.target.checked })}
                      className="rounded border-slate-300 text-accent focus:ring-accent/30"
                    />
                    Done
                  </label>
                </div>
                <textarea
                  value={r.notes}
                  onChange={(e) => onUpdateReminder(r.id, { notes: e.target.value })}
                  rows={2}
                  className="input-base mt-2 text-xs"
                  placeholder="Notes for this follow-up"
                />
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
