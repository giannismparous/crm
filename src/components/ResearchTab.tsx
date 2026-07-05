import { useEffect, useMemo, useRef, useState } from "react";
import { readPersistedTabState, usePersistedTabState } from "../hooks/usePersistedTabState";
import type { Person, ResearchItem } from "../types";
import { newResearchDocId } from "../firebase/firestoreIds";
import { SimpleRichText, SimpleRichTextView } from "./SimpleRichText";
import { ChatMessageBody } from "./ChatMessageBody";
import { ImageAttachmentGallery } from "./ImageAttachmentGallery";
import { ConfirmPanel } from "./TaskWorkerActions";
import { MobileDetailBack } from "./MobileDetailBack";
import { useT } from "../contexts/I18nContext";
import { formatInOrgTime } from "../utils/orgTimezone";
import {
  repairRichTextBody,
  richTextEditorValue,
  sanitizeTaskUpdates,
} from "../utils/sanitizeRichText";
import { isStoredRichTextBody, richTextHasContent } from "../utils/richTextImages";

type Draft = {
  title: string;
  notes: string;
};

function emptyDraft(): Draft {
  return { title: "", notes: "" };
}

function draftFromItem(item: ResearchItem): Draft {
  return {
    title: item.title,
    notes: item.notes ?? "",
  };
}

const RESEARCH_VIEW_DEFAULTS = { selectedId: "" };

export function ResearchTab({
  items,
  people,
  currentUserId,
  onCreateItem,
  onUpdateItem,
  onRemoveItem,
}: {
  items: ResearchItem[];
  people: Person[];
  currentUserId: string;
  onCreateItem: (
    payload: Omit<ResearchItem, "id" | "createdAt" | "updatedAt">,
    itemId?: string
  ) => Promise<string>;
  onUpdateItem: (id: string, patch: Partial<ResearchItem>) => void | Promise<void>;
  onRemoveItem: (id: string) => void | Promise<void>;
}) {
  const t = useT();
  const saved = useMemo(() => readPersistedTabState("research", RESEARCH_VIEW_DEFAULTS), []);
  const [selectedId, setSelectedId] = useState(() => saved.selectedId);
  const [creatingNew, setCreatingNew] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [draftId, setDraftId] = useState(() => newResearchDocId());
  const [notesUploading, setNotesUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedNotesSnapshot, setSavedNotesSnapshot] = useState<string | null>(null);
  const flushNotesSaveRef = useRef<(() => void) | null>(null);
  const latestNotesRef = useRef("");

  function cleanNotesBody(raw: string): string {
    return sanitizeTaskUpdates(repairRichTextBody(raw));
  }

  usePersistedTabState("research", { selectedId });

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId) && !creatingNew) {
      setSelectedId("");
    }
  }, [items, selectedId, creatingNew, setSelectedId]);

  useEffect(() => {
    setSavedNotesSnapshot(null);
  }, [selectedId]);

  useEffect(() => {
    if (!savedNotesSnapshot || !selected) return;
    if ((selected.notes ?? "") === savedNotesSnapshot) {
      setSavedNotesSnapshot(null);
    }
  }, [selected, savedNotesSnapshot]);

  const notesStorageDir = `research/${creatingNew ? draftId : selected?.id ?? draftId}/notes`;
  const uploadsBusy = notesUploading;

  function startNew() {
    const id = newResearchDocId();
    setDraftId(id);
    const next = emptyDraft();
    setDraft(next);
    latestNotesRef.current = next.notes;
    setCreatingNew(true);
    setEditing(true);
    setSelectedId("");
    setConfirmDelete(false);
  }

  function openEdit(item: ResearchItem) {
    const next = draftFromItem(item);
    setDraft(next);
    latestNotesRef.current = next.notes;
    setDraftId(item.id);
    setCreatingNew(false);
    setEditing(true);
    setConfirmDelete(false);
  }

  function cancelEdit() {
    setEditing(false);
    setCreatingNew(false);
    setDraft(emptyDraft());
    setConfirmDelete(false);
  }

  async function save() {
    const title = draft.title.trim();
    if (!title || saving || uploadsBusy) return;

    setSaving(true);
    try {
      flushNotesSaveRef.current?.();
      const notes = cleanNotesBody(latestNotesRef.current);
      latestNotesRef.current = notes;
      if (creatingNew) {
        const id = await onCreateItem(
          {
            title,
            notes,
            createdById: currentUserId,
          },
          draftId
        );
        setSelectedId(id);
        setCreatingNew(false);
        setEditing(false);
        setSavedNotesSnapshot(notes);
      } else if (selected) {
        await onUpdateItem(selected.id, {
          title,
          notes,
        });
        setSavedNotesSnapshot(notes);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!selected) return;
    await onRemoveItem(selected.id);
    setConfirmDelete(false);
    setEditing(false);
    setSelectedId("");
  }

  const showDetail = Boolean(selected || creatingNew);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-6">
      <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h2 className="font-display text-lg font-semibold text-slate-900">{t("research.title")}</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
          >
            {t("research.create")}
          </button>
        </div>
        <ul className="mt-3 max-h-[min(60vh,28rem)] space-y-1 overflow-y-auto">
          {items.length === 0 ? (
            <li className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
              {t("research.emptyList")}
            </li>
          ) : (
            items.map((item) => {
              const active = item.id === selectedId && !creatingNew;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setCreatingNew(false);
                      setEditing(false);
                      setConfirmDelete(false);
                    }}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                      active ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"
                    }`}
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title || t("common.untitled")}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {t("research.updatedAt", {
                        date: formatInOrgTime(item.updatedAt, { dateStyle: "medium", timeStyle: "short" }),
                      })}
                    </p>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {!showDetail ? (
        <section className="hidden rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center lg:block">
          <p className="text-sm text-slate-500">{t("research.selectOrCreate")}</p>
        </section>
      ) : (
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <MobileDetailBack
            onBack={() => {
              if (editing) cancelEdit();
              else {
                setSelectedId("");
                setCreatingNew(false);
              }
            }}
          />

          {editing ? (
            <div className="space-y-4">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-display text-xl font-semibold text-slate-900">
                    {creatingNew ? t("research.newResearch") : t("research.editItem")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{t("research.editHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!draft.title.trim() || saving || uploadsBusy}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              </header>

              <label className="block text-xs font-medium text-slate-600">
                {t("research.itemTitle")}
                <input
                  required
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="input-base mt-1 w-full"
                  placeholder={t("research.itemTitlePlaceholder")}
                />
              </label>

              <div>
                <SimpleRichText
                  value={richTextEditorValue(draft.notes)}
                  persistedHtml={draft.notes}
                  onChange={(html) => {
                    latestNotesRef.current = html;
                    setDraft((d) => ({ ...d, notes: html }));
                  }}
                  placeholder={t("research.contentPlaceholder")}
                  collapseKey={`research-notes-${creatingNew ? draftId : selected?.id ?? draftId}`}
                  inlineImageStorageDir={notesStorageDir}
                  enableGenericFileAttach
                  onImagesUploadingChange={setNotesUploading}
                  flushSaveRef={flushNotesSaveRef}
                />
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-4">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-display text-xl font-semibold text-slate-900">{selected.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("research.updatedAt", {
                      date: formatInOrgTime(selected.updatedAt, { dateStyle: "medium", timeStyle: "short" }),
                    })}
                    {selected.createdById && (
                      <>
                        {" · "}
                        {t("research.createdBy", {
                          name:
                            people.find((p) => p.id === selected.createdById)?.name?.trim() ||
                            t("common.someone"),
                        })}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(selected)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </header>

              {(richTextHasContent(savedNotesSnapshot ?? selected.notes ?? "") ||
                (selected.attachments?.length ?? 0) > 0) && (
                <div className="space-y-3">
                  {richTextHasContent(savedNotesSnapshot ?? selected.notes ?? "") && (
                    <div className="text-slate-800">
                      {isStoredRichTextBody(savedNotesSnapshot ?? selected.notes ?? "") ? (
                        <SimpleRichTextView
                          html={savedNotesSnapshot ?? selected.notes ?? ""}
                          collapseKey={`research-notes-view-${selected.id}`}
                        />
                      ) : (
                        <ChatMessageBody
                          body={savedNotesSnapshot ?? selected.notes ?? ""}
                          className="break-words text-sm text-slate-800"
                          linkClassName="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-dim"
                        />
                      )}
                    </div>
                  )}
                  {(selected.attachments?.length ?? 0) > 0 && (
                    <div>
                      <ImageAttachmentGallery
                        scopeKey={`research-${selected.id}`}
                        attachments={selected.attachments}
                      />
                    </div>
                  )}
                </div>
              )}

              {!richTextHasContent(savedNotesSnapshot ?? selected.notes ?? "") &&
                (selected.attachments?.length ?? 0) === 0 && (
                <p className="text-sm text-slate-500">{t("research.emptyContent")}</p>
              )}

              {confirmDelete && (
                <ConfirmPanel
                  message={t("research.deleteConfirmMessage")}
                  yesLabel={t("common.delete")}
                  noLabel={t("common.cancel")}
                  yesEmphasis
                  onYes={() => void confirmRemove()}
                  onNo={() => setConfirmDelete(false)}
                />
              )}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
