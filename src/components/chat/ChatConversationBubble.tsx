import { X } from "lucide-react";
import { conversationDisplayTitle } from "../../firebase/chat";
import { isPresenceOnline, usePresenceTick } from "../../hooks/usePresence";
import type { ChatConversation, Person, PersonPresence } from "../../types";
import { PersonPresenceAvatar } from "../PersonPresenceAvatar";

export function ChatConversationBubble({
  conversation,
  people,
  currentUserId,
  presenceMap,
  active,
  dimmed,
  unreadCount,
  entering,
  exiting,
  onToggle,
  onClose,
}: {
  conversation: ChatConversation;
  people: Person[];
  currentUserId: string;
  presenceMap: Map<string, PersonPresence>;
  active: boolean;
  dimmed?: boolean;
  unreadCount: number;
  entering?: boolean;
  exiting?: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const nowMs = usePresenceTick();
  const title = conversationDisplayTitle(conversation, people, currentUserId);
  const peerId =
    conversation.kind === "dm" ? conversation.memberIds.find((id) => id !== currentUserId) : undefined;
  const peer = peerId ? people.find((p) => p.id === peerId) : undefined;
  const online = peerId ? isPresenceOnline(presenceMap.get(peerId), nowMs) : false;

  return (
    <div
      className={`group pointer-events-auto relative transition-all duration-200 ease-out ${
        entering ? "chat-bubble-enter" : ""
      } ${exiting ? "chat-bubble-exit" : ""}`}
    >
      {active && (
        <span
          className="chat-bubble-aura pointer-events-none absolute inset-0 rounded-full"
          aria-hidden
        />
      )}

      <button
        type="button"
        onClick={onToggle}
        title={title}
        aria-label={`${title}${active ? ", open" : ", expand"}`}
        aria-pressed={active}
        className={`chat-bubble-dock-btn relative z-10 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white shadow-lg ring-1 ring-black/5 hover:shadow-xl focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
          active ? "chat-bubble-dock-btn--active" : ""
        } ${dimmed && !active ? "chat-bubble-dock-btn--inactive" : ""}`}
      >
        {conversation.kind === "founders" ? (
          <span className="flex h-full w-full items-center justify-center bg-violet-100 text-xs font-bold text-violet-800">
            F
          </span>
        ) : conversation.kind === "group" ? (
          <span className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-bold text-slate-600">
            {conversation.memberIds.length}
          </span>
        ) : (
          <PersonPresenceAvatar person={peer} size="md" online={online} />
        )}
        {unreadCount > 0 && !active && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full border-2 border-white bg-rose-600 px-0.5 text-[9px] font-bold leading-none text-white"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close chat"
        aria-label={`Close ${title}`}
        className={`absolute -right-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 opacity-0 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
