import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { OrgRole } from "../../auth/roles";
import { conversationDisplayTitle, isConversationUnread } from "../../firebase/chat";
import type { ChatConversation, ChatMemberState, Person, TeamDepartment } from "../../types";
import { TEAM_DEPARTMENTS } from "../../types";
import { groupDepartmentsFromPeople, resolveGroupMemberIds } from "../../utils/chatGroup";
import { peopleMessageableByViewer } from "../../utils/chatVisibility";
import { useOnlinePersonIds, usePresenceTick } from "../../hooks/usePresence";
import type { PersonPresence } from "../../types";
import { useI18n } from "../../contexts/I18nContext";
import { translateDepartment } from "../../i18n/helpers";
import { PersonPresenceAvatar } from "../PersonPresenceAvatar";

export function ChatLauncherPopover({
  conversations,
  openIds,
  people,
  currentUserId,
  currentUserOrgRole,
  myMemberState,
  presenceMap,
  presenceTickEnabled = true,
  onOpenChat,
  onOpenOrCreateDm,
  onCreateGroup,
  onClose,
}: {
  conversations: ChatConversation[];
  openIds: string[];
  people: Person[];
  currentUserId: string;
  currentUserOrgRole: OrgRole;
  myMemberState: ChatMemberState | null;
  presenceMap: Map<string, PersonPresence>;
  presenceTickEnabled?: boolean;
  onOpenChat: (conversationId: string) => void;
  onOpenOrCreateDm: (personId: string) => Promise<string>;
  onCreateGroup: (participantIds: string[], departmentIds: string[], title: string) => Promise<string>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"list" | "dm" | "group">("list");
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [pickedDepartments, setPickedDepartments] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nowMs = usePresenceTick(presenceTickEnabled);
  const onlineIds = useOnlinePersonIds(presenceMap, nowMs);
  const readMap = myMemberState?.readByConversation ?? {};

  const messageable = useMemo(
    () => peopleMessageableByViewer(people, people.find((p) => p.id === currentUserId), currentUserId, currentUserOrgRole),
    [people, currentUserId, currentUserOrgRole]
  );

  const messageableIdSet = useMemo(() => new Set(messageable.map((p) => p.id)), [messageable]);

  const selectableDepartments = useMemo(
    () => groupDepartmentsFromPeople(people, messageableIdSet).filter((d): d is TeamDepartment =>
      (TEAM_DEPARTMENTS as readonly string[]).includes(d)
    ),
    [people, messageableIdSet]
  );

  const resolvedMemberCount = useMemo(
    () => resolveGroupMemberIds(currentUserId, pickedIds, pickedDepartments, people).length,
    [currentUserId, pickedIds, pickedDepartments, people]
  );

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      conversationDisplayTitle(c, people, currentUserId).toLowerCase().includes(q)
    );
  }, [conversations, people, currentUserId, query]);

  function resetGroupForm() {
    setPickedIds([]);
    setPickedDepartments([]);
    setGroupTitle("");
  }

  async function startDm(personId: string) {
    setError(null);
    try {
      const id = await onOpenOrCreateDm(personId);
      onOpenChat(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("chat.error.start"));
    }
  }

  async function startGroup(e: React.FormEvent) {
    e.preventDefault();
    if (pickedIds.length === 0 && pickedDepartments.length === 0) return;
    setError(null);
    try {
      const id = await onCreateGroup(pickedIds, pickedDepartments, groupTitle);
      onOpenChat(id);
      setMode("list");
      resetGroupForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("chat.error.createGroup"));
    }
  }

  const canCreateGroup = pickedIds.length > 0 || pickedDepartments.length > 0;

  return (
    <div
      className="pointer-events-auto mb-3 flex w-[min(18rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
      role="dialog"
      aria-label={t("chat.title")}
    >
      <div className="border-b border-slate-100 px-3 py-2.5">
        <p className="text-sm font-semibold text-slate-900">{t("chat.title")}</p>
        <p className="text-[11px] text-slate-500">{t("chat.subtitle")}</p>
      </div>

      {mode === "list" && (
        <>
          <div className="border-b border-slate-100 px-2 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("chat.search")}
                className="input-base w-full py-1.5 pl-8 text-sm"
              />
            </div>
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                onClick={() => setMode("dm")}
                className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t("chat.newDm")}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetGroupForm();
                  setMode("group");
                }}
                className="flex-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
              >
                {t("chat.newGroup")}
              </button>
            </div>
          </div>

          <ul className="max-h-64 overflow-y-auto py-1">
            {filteredConversations.map((c) => {
              const title = conversationDisplayTitle(c, people, currentUserId);
              const unread = isConversationUnread(c, readMap);
              const isOpen = openIds.includes(c.id);
              const peerId = c.kind === "dm" ? c.memberIds.find((id) => id !== currentUserId) : undefined;
              const peer = peerId ? people.find((p) => p.id === peerId) : undefined;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChat(c.id);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    {c.kind === "founders" ? (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-800">
                        F
                      </span>
                    ) : c.kind === "group" ? (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                        {c.memberIds.length}
                      </span>
                    ) : (
                      <PersonPresenceAvatar
                        person={peer}
                        size="sm"
                        online={peerId ? onlineIds.has(peerId) : false}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm ${unread ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}
                      >
                        {title}
                      </span>
                      {c.lastMessagePreview && (
                        <span className="block truncate text-xs text-slate-500">{c.lastMessagePreview}</span>
                      )}
                    </span>
                    {isOpen && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-500">
                        {t("common.open")}
                      </span>
                    )}
                    {unread && !isOpen && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label={t("common.unread")} />
                    )}
                  </button>
                </li>
              );
            })}
            {filteredConversations.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-slate-500">{t("chat.empty")}</li>
            )}
          </ul>
        </>
      )}

      {mode === "dm" && (
        <div className="p-3">
          <button type="button" onClick={() => setMode("list")} className="mb-2 text-xs text-accent hover:underline">
            {t("common.back")}
          </button>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {messageable.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => void startDm(p.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                >
                  <PersonPresenceAvatar person={p} size="xs" online={onlineIds.has(p.id)} />
                  <span className="truncate text-sm text-slate-800">{p.name.trim() || p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "group" && (
        <form onSubmit={(e) => void startGroup(e)} className="p-3">
          <button
            type="button"
            onClick={() => {
              resetGroupForm();
              setMode("list");
            }}
            className="mb-2 text-xs text-accent hover:underline"
          >
            {t("common.back")}
          </button>
          <input
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value)}
            placeholder={t("chat.groupNamePlaceholder")}
            className="input-base mb-2 w-full text-sm"
          />

          {selectableDepartments.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("common.departments")}
              </p>
              <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-lg border border-slate-100 p-1">
                {selectableDepartments.map((dept) => (
                  <li key={dept}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={pickedDepartments.includes(dept)}
                        onChange={() =>
                          setPickedDepartments((prev) =>
                            prev.includes(dept) ? prev.filter((x) => x !== dept) : [...prev, dept]
                          )
                        }
                      />
                      <span className="text-sm text-slate-800">{translateDepartment(locale, dept)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("common.people")}
          </p>
          <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-slate-100 p-1">
            {messageable.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={pickedIds.includes(p.id)}
                    onChange={() =>
                      setPickedIds((prev) =>
                        prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                      )
                    }
                  />
                  <PersonPresenceAvatar person={p} size="xs" online={onlineIds.has(p.id)} />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {p.name.trim() || p.email}
                    {p.departments.length > 0 && (
                      <span className="ml-1 text-[10px] text-slate-400">
                        ({p.departments.map((d) => translateDepartment(locale, d)).join(", ")})
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {canCreateGroup && (
            <p className="mt-2 text-[11px] text-slate-500">
              {t("chat.memberCount", { count: resolvedMemberCount })}
            </p>
          )}

          <button
            type="submit"
            disabled={!canCreateGroup}
            className="mt-2 w-full rounded-lg bg-accent py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {t("chat.createOpen")}
          </button>
        </form>
      )}

      {error && <p className="border-t border-slate-100 px-3 py-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
