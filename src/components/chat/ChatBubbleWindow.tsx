import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Check, CheckCheck, ChevronDown } from "lucide-react";
import { getFirestoreDb, SIMASIA_AI_ORG_ID } from "../../firebase/config";
import {
  conversationDisplayTitle,
  messageReadByAllOthers,
} from "../../firebase/chat";
import { useChatPeerReadStates } from "../../hooks/useChatPeerReadStates";
import { useChatWindowMessages } from "../../hooks/useChatWindowMessages";
import { isKeyboardComposing } from "../../utils/keyboardComposition";
import { isPresenceOnline, usePresenceTick } from "../../hooks/usePresence";
import type {
  ChatConversation,
  ChatMemberState,
  ChatMessage,
  ImageAttachment,
  Person,
  PersonPresence,
} from "../../types";
import { formatInOrgTime, formatInTimezone, getActiveTimezone } from "../../utils/orgTimezone";
import { canUnsendChatMessage } from "../../utils/chatUnsend";
import { isValidTimezone } from "../../utils/userTimezone";
import { useI18n, useT } from "../../contexts/I18nContext";
import { ChatConversationHistory } from "../ChatConversationHistory";
import { ChatMessageBody } from "../ChatMessageBody";
import { ImageAttachmentGallery } from "../ImageAttachmentGallery";
import { InlineImageAttachments } from "../InlineImageAttachments";
import { PersonPresenceAvatar } from "../PersonPresenceAvatar";
import { PersonAvatar } from "../PersonAvatar";
import { formatChatDateSeparatorLabel, messageOrgDateKey } from "../../utils/chatMessageDates";
import {
  CHAT_BUBBLE_SIZE,
  CHAT_DOCK_MARGIN,
  CHAT_PANEL_GAP,
  CHAT_PANEL_TAIL_OFFSET,
} from "./chatDockLayout";
import { ChatDateSeparator } from "./ChatDateSeparator";

const ORG = SIMASIA_AI_ORG_ID;
const CHAT_WIDTH = 492;
const CHAT_MESSAGE_UNSEND_MS = 280;

function formatMessageTime(iso: string): string {
  return formatInOrgTime(iso, { hour: "numeric", minute: "2-digit" });
}

const CHAT_MSG_AVATAR_SIZE = "xs" as const;
const CHAT_MSG_AVATAR_SPACER_CLASS = "w-6 shrink-0";

function showMessageAvatar(
  messages: ChatMessage[],
  index: number,
  showDateSeparator: boolean
): boolean {
  if (showDateSeparator || index === 0) return true;
  return messages[index - 1]!.authorId !== messages[index]!.authorId;
}

function ChatMessagesLoading() {
  const t = useT();
  return (
    <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 py-10" aria-busy="true">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-accent" />
      <p className="text-xs text-slate-400">{t("chat.loadingMessages")}</p>
    </div>
  );
}

function ReadReceipt({
  message,
  conversation,
  peerMemberStates,
  currentUserId,
  mine,
}: {
  message: ChatMessage;
  conversation: ChatConversation;
  peerMemberStates: Map<string, ChatMemberState>;
  currentUserId: string;
  mine: boolean;
}) {
  const t = useT();
  if (!mine) return null;
  const read = messageReadByAllOthers(message, conversation, peerMemberStates, currentUserId);
  const Icon = read ? CheckCheck : Check;
  return (
    <Icon
      className={`inline-block h-3 w-3 shrink-0 ${read ? "text-sky-200" : "text-white/60"}`}
      aria-label={read ? t("common.read") : t("common.sent")}
    />
  );
}

export function ChatBubbleWindow({
  conversation,
  people,
  currentUserId,
  presenceMap,
  panelMotion,
  panelRight,
  onMinimize,
  onSendMessage,
  onUnsendMessage,
  onMarkRead,
}: {
  conversation: ChatConversation;
  people: Person[];
  currentUserId: string;
  presenceMap: Map<string, PersonPresence>;
  panelMotion: "hidden" | "open" | "exit";
  panelRight: number;
  onMinimize: () => void;
  onSendMessage: (
    conversationId: string,
    payload: { body: string; attachments?: ImageAttachment[] }
  ) => Promise<void>;
  onUnsendMessage: (conversationId: string, message: ChatMessage) => Promise<void>;
  onMarkRead: (conversationId: string, at?: string) => void | Promise<void>;
}) {
  const t = useT();
  const { locale } = useI18n();
  const db = getFirestoreDb();
  const { messages, loading, hasOlder, loadingOlder, loadOlder } = useChatWindowMessages(
    db,
    ORG,
    conversation.id,
    true
  );
  const peerMemberStates = useChatPeerReadStates(db, ORG, conversation, currentUserId, true);
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<ImageAttachment[]>([]);
  const [draftUploading, setDraftUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unsendingId, setUnsendingId] = useState<string | null>(null);
  const [exitingMessageIds, setExitingMessageIds] = useState<string[]>([]);
  const [unsendError, setUnsendError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const [enteringMessageIds, setEnteringMessageIds] = useState<string[]>([]);
  const prevMessageCountRef = useRef(0);
  const wasLoadingRef = useRef(true);
  const nowMs = usePresenceTick();

  const title = conversationDisplayTitle(conversation, people, currentUserId);
  const me = people.find((p) => p.id === currentUserId);
  const peerId =
    conversation.kind === "dm" ? conversation.memberIds.find((id) => id !== currentUserId) : undefined;
  const peer = peerId ? people.find((p) => p.id === peerId) : undefined;
  const online = peerId ? isPresenceOnline(presenceMap.get(peerId), nowMs) : false;
  const peerTimezone = peerId ? presenceMap.get(peerId)?.timezone : undefined;
  const viewerTimezone = getActiveTimezone();
  const peerLocalTime =
    conversation.kind === "dm" &&
    peerTimezone &&
    isValidTimezone(peerTimezone) &&
    peerTimezone !== viewerTimezone
      ? formatInTimezone(nowMs, peerTimezone, {
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        })
      : null;
  const showLoading = loading && messages.length === 0;
  const panelOpen = panelMotion === "open";

  useEffect(() => {
    knownMessageIdsRef.current = new Set();
    setEnteringMessageIds([]);
    prevMessageCountRef.current = 0;
    wasLoadingRef.current = true;
  }, [conversation.id]);

  useEffect(() => {
    if (loading) return;
    const fresh = messages.filter((m) => !knownMessageIdsRef.current.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) knownMessageIdsRef.current.add(m.id);
    setEnteringMessageIds(fresh.map((m) => m.id));
    const t = window.setTimeout(() => setEnteringMessageIds([]), 450);
    return () => window.clearTimeout(t);
  }, [messages, loading]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !panelOpen) return;

    if (loading) {
      wasLoadingRef.current = true;
      return;
    }

    const justLoaded = wasLoadingRef.current;
    wasLoadingRef.current = false;
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (messages.length === 0) return;

    requestAnimationFrame(() => {
      if (justLoaded || !grew) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [messages, loading, panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;

    const markReadIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      const last = messages[messages.length - 1];
      if (!last) return;
      void onMarkRead(conversation.id, last.createdAt);
    };

    markReadIfVisible();
    document.addEventListener("visibilitychange", markReadIfVisible);
    return () => document.removeEventListener("visibilitychange", markReadIfVisible);
  }, [messages, conversation.id, onMarkRead, panelOpen]);

  async function handleLoadOlder() {
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    await loadOlder();
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (sending || draftUploading) return;
    const body = draft;
    const attachments = draftAttachments;
    if (!body.trim() && attachments.length === 0) return;

    setSendError(null);
    flushSync(() => {
      setDraft("");
      setDraftAttachments([]);
    });
    setSending(true);
    try {
      await onSendMessage(conversation.id, { body, attachments });
    } catch (err) {
      setDraft(body);
      setDraftAttachments(attachments);
      setSendError(err instanceof Error ? err.message : t("chat.error.send"));
    } finally {
      setSending(false);
    }
  }

  async function handleUnsend(message: ChatMessage) {
    if (unsendingId || exitingMessageIds.includes(message.id)) return;
    setUnsendError(null);
    setExitingMessageIds((prev) => [...prev, message.id]);

    await new Promise<void>((resolve) => window.setTimeout(resolve, CHAT_MESSAGE_UNSEND_MS));

    setUnsendingId(message.id);
    try {
      await onUnsendMessage(conversation.id, message);
    } catch (err) {
      setExitingMessageIds((prev) => prev.filter((id) => id !== message.id));
      setUnsendError(err instanceof Error ? err.message : t("chat.error.unsend"));
    } finally {
      setUnsendingId(null);
      setExitingMessageIds((prev) => prev.filter((id) => id !== message.id));
    }
  }

  const showTail = panelMotion === "open" || panelMotion === "exit";

  return (
    <div
      data-motion={panelMotion}
      className="chat-panel-shell chat-panel-shell-positioned fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
      style={{
        width: CHAT_WIDTH,
        height: "min(28rem, calc(100vh - 6rem))",
        bottom: CHAT_DOCK_MARGIN + CHAT_BUBBLE_SIZE + CHAT_PANEL_GAP,
        right: panelRight,
        maxWidth: "calc(100vw - 3rem)",
      }}
      role="dialog"
      aria-label={t("chat.withTitle", { title })}
      aria-hidden={panelMotion !== "open"}
    >
      {showTail && (
        <span
          className="chat-panel-tail pointer-events-none absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-slate-200 bg-white"
          style={{ right: CHAT_PANEL_TAIL_OFFSET - 6 }}
          aria-hidden
        />
      )}

      <header
        className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 ${
          panelOpen ? "border-accent/20 bg-accent/[0.04]" : "border-slate-100 bg-slate-50/80"
        }`}
      >
        {conversation.kind === "founders" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-800">
            F
          </span>
        ) : conversation.kind === "group" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
            {conversation.memberIds.length}
          </span>
        ) : (
          <PersonPresenceAvatar person={peer} size="sm" online={online} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          {conversation.kind === "dm" && (
            <div className="text-[10px] text-slate-500">
              <p>{online ? t("common.active") : t("common.offline")}</p>
              {peerLocalTime && <p className="text-slate-400">{peerLocalTime}</p>}
            </div>
          )}
        </div>
        <ChatConversationHistory messages={messages} people={people} />
        <button
          type="button"
          onClick={onMinimize}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/80 hover:text-slate-700"
          aria-label={t("chat.minimize")}
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-3 py-3">
        {showLoading ? (
          <ChatMessagesLoading />
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">{t("chat.emptyThread")}</p>
        ) : (
          <div className="chat-messages-reveal">
            {hasOlder && (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  disabled={loadingOlder}
                  onClick={() => void handleLoadOlder()}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                >
                  {loadingOlder ? t("common.loading") : t("chat.loadOlder")}
                </button>
              </div>
            )}
            {messages.map((m, index) => {
              const dateKey = messageOrgDateKey(m.createdAt);
              const prevDateKey =
                index > 0 ? messageOrgDateKey(messages[index - 1]!.createdAt) : "";
              const showDateSeparator = Boolean(dateKey && dateKey !== prevDateKey);
              const showAvatar = showMessageAvatar(messages, index, showDateSeparator);
              const groupedWithPrev =
                index > 0 &&
                !showDateSeparator &&
                messages[index - 1]!.authorId === m.authorId;
              const mine = m.authorId === currentUserId;
              const author = people.find((p) => p.id === m.authorId);
              const avatarPerson = mine ? me : author;
              const enteringIndex = enteringMessageIds.indexOf(m.id);
              const isEntering = enteringIndex >= 0;
              const isExiting = exitingMessageIds.includes(m.id);
              const staggerMs = isEntering ? Math.min(enteringIndex * 30, 240) : 0;
              const canUnsend =
                mine && !isExiting && canUnsendChatMessage(m, currentUserId, nowMs);
              return (
                <Fragment key={m.id}>
                  {showDateSeparator && (
                    <ChatDateSeparator label={formatChatDateSeparatorLabel(dateKey, locale)} />
                  )}
                <div
                  className={`grid transition-[grid-template-rows] duration-[280ms] ease-in ${
                    isExiting ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                  } ${groupedWithPrev ? "mt-0.5" : "mt-2"}`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      className={`group/msg flex items-start gap-2 ${mine ? "justify-end" : "justify-start"} ${
                        isExiting
                          ? `chat-message-out ${mine ? "chat-message-out--mine" : "chat-message-out--theirs"}`
                          : ""
                      } ${isEntering ? "chat-message-in" : ""}`}
                      style={isEntering ? { animationDelay: `${staggerMs}ms` } : undefined}
                    >
                      {!mine && (
                        showAvatar ? (
                          <PersonAvatar person={avatarPerson} size={CHAT_MSG_AVATAR_SIZE} />
                        ) : (
                          <span className={CHAT_MSG_AVATAR_SPACER_CLASS} aria-hidden />
                        )
                      )}
                  <div
                    className={`max-w-[calc(100%-2rem)] rounded-2xl px-3 py-1.5 sm:max-w-[88%] ${
                      mine ? "bg-accent text-white" : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    {!mine && conversation.kind !== "dm" && showAvatar && (
                      <p className="mb-0.5 text-[10px] font-semibold opacity-70">
                        {author?.name.trim() || t("common.member")}
                      </p>
                    )}
                    <ChatMessageBody
                      body={m.body}
                      linkClassName={
                        mine
                          ? "underline underline-offset-2 text-white"
                          : "text-accent underline underline-offset-2"
                      }
                    />
                    {(m.attachments?.length ?? 0) > 0 && (
                      <ImageAttachmentGallery
                        scopeKey={`win-${m.id}`}
                        attachments={m.attachments}
                        layout="chat"
                      />
                    )}
                    <div
                      className={`mt-0.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[10px] ${
                        mine ? "text-white/75" : "text-slate-500"
                      }`}
                    >
                      {canUnsend && (
                        <button
                          type="button"
                          disabled={unsendingId === m.id}
                          onClick={() => void handleUnsend(m)}
                          className={`font-medium underline-offset-2 opacity-0 transition hover:underline group-hover/msg:opacity-100 focus-visible:opacity-100 disabled:opacity-50 ${
                            mine ? "text-white/90 hover:text-white" : "text-accent"
                          }`}
                        >
                          {t("chat.unsend")}
                        </button>
                      )}
                      <span>{formatMessageTime(m.createdAt)}</span>
                      <ReadReceipt
                        message={m}
                        conversation={conversation}
                        peerMemberStates={peerMemberStates}
                        currentUserId={currentUserId}
                        mine={mine}
                      />
                    </div>
                  </div>
                      {mine && (
                        showAvatar ? (
                          <PersonAvatar person={avatarPerson} size={CHAT_MSG_AVATAR_SIZE} />
                        ) : (
                          <span className={CHAT_MSG_AVATAR_SPACER_CLASS} aria-hidden />
                        )
                      )}
                    </div>
                  </div>
                </div>
                </Fragment>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {unsendError && (
        <p className="shrink-0 border-t border-rose-100 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
          {unsendError}
        </p>
      )}

      {sendError && (
        <p className="shrink-0 border-t border-rose-100 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
          {sendError}
        </p>
      )}

      <form onSubmit={(e) => void handleSend(e)} className="shrink-0 border-t border-slate-100 p-2">
        <div className="relative">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={sending ? t("common.sending") : t("chat.messagePlaceholder")}
            className="input-base min-h-[40px] w-full resize-none pb-9 text-sm"
            onKeyDown={(e) => {
              if (sending || draftUploading) return;
              if (e.key === "Enter" && !e.shiftKey) {
                if (isKeyboardComposing(e)) return;
                e.preventDefault();
                void handleSend(e);
              }
            }}
          />
          <InlineImageAttachments
            storageDir={`chat/${conversation.id}`}
            attachments={draftAttachments}
            onAttachmentsChange={setDraftAttachments}
            onUploadingChange={setDraftUploading}
            disabled={sending}
          />
        </div>
        <button
          type="submit"
          disabled={sending || draftUploading || (!draft.trim() && draftAttachments.length === 0)}
          aria-busy={sending}
          className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <>
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-white/35 border-t-white"
                aria-hidden
              />
              {t("common.sending")}
            </>
          ) : draftUploading ? (
            <>
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-white/35 border-t-white"
                aria-hidden
              />
              {t("common.uploading")}
            </>
          ) : (
            t("chat.send")
          )}
        </button>
      </form>
    </div>
  );
}
