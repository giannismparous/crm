import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import type { OrgRole } from "../../auth/roles";
import { isConversationUnread } from "../../firebase/chat";
import { useChatDockUnreadCounts } from "../../hooks/useChatDockUnreadCounts";
import { useOpenChatWindows } from "../../hooks/useOpenChatWindows";
import { getFirestoreDb, SIMASIA_AI_ORG_ID } from "../../firebase/config";
import type {
  ChatConversation,
  ChatMemberState,
  ChatMessage,
  ImageAttachment,
  Person,
  PersonPresence,
} from "../../types";
import { ChatBubbleWindow } from "./ChatBubbleWindow";
import { ChatConversationBubble } from "./ChatConversationBubble";
import { ChatLauncherPopover } from "./ChatLauncherPopover";
import { useT } from "../../contexts/I18nContext";
import { CHAT_DOCK_MARGIN, chatPanelRightForBubble } from "./chatDockLayout";

const PANEL_ANIM_MS = 220;
const BUBBLE_ANIM_MS = 200;
const ORG = SIMASIA_AI_ORG_ID;
const EMPTY_READ_MAP: Record<string, string> = {};

type PanelMotion = "hidden" | "open" | "exit";

export function MessagesChatStack({
  unreadCount,
  people,
  currentUserId,
  currentUserOrgRole,
  conversations,
  myMemberState,
  presenceMap,
  onSendMessage,
  onUnsendMessage,
  onOpenOrCreateDm,
  onCreateGroup,
  onMarkRead,
  onMarkChatNotificationsRead,
  openConversationRequest,
  onOpenConversationRequestHandled,
  onActivityChange,
}: {
  unreadCount: number;
  people: Person[];
  currentUserId: string;
  currentUserOrgRole: OrgRole;
  conversations: ChatConversation[];
  myMemberState: ChatMemberState | null;
  presenceMap: Map<string, PersonPresence>;
  onSendMessage: (
    conversationId: string,
    payload: { body: string; attachments?: ImageAttachment[] }
  ) => Promise<void>;
  onUnsendMessage: (conversationId: string, message: ChatMessage) => Promise<void>;
  onOpenOrCreateDm: (personId: string) => Promise<string>;
  onCreateGroup: (participantIds: string[], departmentIds: string[], title: string) => Promise<string>;
  onMarkRead: (conversationId: string, at?: string) => void | Promise<void>;
  onMarkChatNotificationsRead?: (conversationId: string) => void | Promise<void>;
  openConversationRequest?: string | null;
  onOpenConversationRequestHandled?: () => void;
  onActivityChange?: (active: boolean) => void;
}) {
  const t = useT();
  const {
    openIds,
    expandedId,
    openWindow,
    closeWindow,
    toggleExpanded,
    minimizeAll,
  } = useOpenChatWindows();
  const [launcherOpen, setLauncherOpen] = useState(
    () => new URLSearchParams(window.location.search).get("tab") === "messages"
  );
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [panelMotion, setPanelMotion] = useState<PanelMotion>("hidden");
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());
  const prevOpenIdsRef = useRef(openIds);
  const activePanelIdRef = useRef<string | null>(null);
  const openRafRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  activePanelIdRef.current = activePanelId;
  const readMap = myMemberState?.readByConversation ?? EMPTY_READ_MAP;
  const db = getFirestoreDb();
  const dockUnreadCounts = useChatDockUnreadCounts(
    db,
    ORG,
    openIds,
    readMap,
    currentUserId
  );

  const handleMarkRead = useCallback(
    (conversationId: string, at?: string) => {
      void onMarkRead(conversationId, at);
      if (document.visibilityState === "visible") {
        void onMarkChatNotificationsRead?.(conversationId);
      }
    },
    [onMarkRead, onMarkChatNotificationsRead]
  );

  const handleOpenChat = useCallback(
    (conversationId: string) => {
      setLauncherOpen(false);
      openWindow(conversationId);
    },
    [openWindow]
  );

  const handleToggleLauncher = useCallback(() => {
    setLauncherOpen((open) => {
      if (open) return false;
      minimizeAll();
      return true;
    });
  }, [minimizeAll]);

  const handleToggleChat = useCallback(
    (conversationId: string) => {
      setLauncherOpen(false);
      toggleExpanded(conversationId);
    },
    [toggleExpanded]
  );

  useEffect(() => {
    if (!openConversationRequest) return;
    handleOpenChat(openConversationRequest);
    onOpenConversationRequestHandled?.();
  }, [openConversationRequest, handleOpenChat, onOpenConversationRequestHandled]);

  useEffect(() => {
    if (launcherOpen && expandedId) minimizeAll();
  }, [launcherOpen, expandedId, minimizeAll]);

  useEffect(() => {
    onActivityChange?.(launcherOpen || openIds.length > 0);
  }, [launcherOpen, openIds.length, onActivityChange]);

  useEffect(() => {
    if (!launcherOpen) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setLauncherOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [launcherOpen]);

  useEffect(() => {
    const added = openIds.filter((id) => !prevOpenIdsRef.current.includes(id));
    prevOpenIdsRef.current = openIds;
    if (added.length === 0) return;
    setEnteringIds((prev) => new Set([...prev, ...added]));
    const t = window.setTimeout(() => {
      setEnteringIds((prev) => {
        const next = new Set(prev);
        for (const id of added) next.delete(id);
        return next;
      });
    }, BUBBLE_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [openIds]);

  useLayoutEffect(() => {
    if (openRafRef.current !== null) {
      cancelAnimationFrame(openRafRef.current);
      openRafRef.current = null;
    }

    if (expandedId) {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }

      const prevPanelId = activePanelIdRef.current;
      const switching = prevPanelId !== null && prevPanelId !== expandedId;
      setActivePanelId(expandedId);
      if (switching || prevPanelId === expandedId) {
        setPanelMotion("open");
        return;
      }
      setPanelMotion("hidden");
      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = requestAnimationFrame(() => {
          openRafRef.current = null;
          setPanelMotion("open");
        });
      });
      return;
    }

    if (activePanelIdRef.current) {
      setPanelMotion("exit");
    }
  }, [expandedId]);

  useEffect(() => {
    if (panelMotion !== "exit") return;
    exitTimerRef.current = window.setTimeout(() => {
      setActivePanelId(null);
      setPanelMotion("hidden");
      exitTimerRef.current = null;
    }, PANEL_ANIM_MS);
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [panelMotion]);

  useEffect(() => {
    return () => {
      if (openRafRef.current !== null) cancelAnimationFrame(openRafRef.current);
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  const handleCloseBubble = useCallback(
    (conversationId: string) => {
      setExitingIds((prev) => new Set(prev).add(conversationId));
      window.setTimeout(() => {
        closeWindow(conversationId);
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(conversationId);
          return next;
        });
      }, BUBBLE_ANIM_MS);
    },
    [closeWindow]
  );

  const openConversations = openIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter((c): c is ChatConversation => Boolean(c));

  const activeIndex = activePanelId
    ? openConversations.findIndex((c) => c.id === activePanelId)
    : -1;
  const hasActivePanel = activePanelId !== null && panelMotion !== "hidden";
  const activePanelRight =
    activeIndex >= 0
      ? chatPanelRightForBubble(openConversations.length, activeIndex)
      : CHAT_DOCK_MARGIN;

  return (
    <>
      {openConversations.map((conv, index) => (
        <ChatBubbleWindow
          key={conv.id}
          conversation={conv}
          people={people}
          currentUserId={currentUserId}
          presenceMap={presenceMap}
          panelMotion={activePanelId === conv.id ? panelMotion : "hidden"}
          panelRight={
            activePanelId === conv.id
              ? activePanelRight
              : chatPanelRightForBubble(openConversations.length, index)
          }
          onMinimize={minimizeAll}
          onSendMessage={onSendMessage}
          onUnsendMessage={onUnsendMessage}
          onMarkRead={handleMarkRead}
        />
      ))}

      <div
        ref={rootRef}
        className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col items-end"
      >
        {launcherOpen && (
          <ChatLauncherPopover
            conversations={conversations}
            openIds={openIds}
            people={people}
            currentUserId={currentUserId}
            currentUserOrgRole={currentUserOrgRole}
            myMemberState={myMemberState}
            presenceMap={presenceMap}
            onOpenChat={handleOpenChat}
            onOpenOrCreateDm={onOpenOrCreateDm}
            onCreateGroup={onCreateGroup}
            onClose={() => setLauncherOpen(false)}
          />
        )}

        <div className="pointer-events-none flex flex-row-reverse items-end gap-2">
          <button
            type="button"
            onClick={handleToggleLauncher}
            title={t("chat.allChats")}
            aria-label={
              unreadCount > 0
                ? t("chat.allChatsUnread", { count: unreadCount })
                : t("chat.allChats")
            }
            aria-expanded={launcherOpen}
            className="chat-launcher-btn pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-glow ring-1 ring-accent/30 transition-all duration-200 hover:scale-105 hover:bg-accent-dim focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <MessageCircle className="h-5 w-5 text-white" strokeWidth={2} aria-hidden />
            {unreadCount > 0 && openIds.length === 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full border-2 border-accent bg-rose-500 px-0.5 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {openConversations.map((conv) => {
            const counted = dockUnreadCounts.get(conv.id) ?? 0;
            const unreadCount =
              counted > 0 ? counted : isConversationUnread(conv, readMap) ? 1 : 0;
            return (
            <ChatConversationBubble
              key={conv.id}
              conversation={conv}
              people={people}
              currentUserId={currentUserId}
              presenceMap={presenceMap}
              active={activePanelId === conv.id && panelMotion !== "hidden"}
              dimmed={hasActivePanel}
              unreadCount={unreadCount}
              entering={enteringIds.has(conv.id)}
              exiting={exitingIds.has(conv.id)}
              onToggle={() => handleToggleChat(conv.id)}
              onClose={() => handleCloseBubble(conv.id)}
            />
            );
          })}
        </div>
      </div>
    </>
  );
}
