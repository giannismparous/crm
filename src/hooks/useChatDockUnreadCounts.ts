import { useEffect, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { countUnreadChatMessages } from "../firebase/chat";
import { getCachedChatMessages, subscribeChatMessageCache } from "../utils/chatMessageCache";

function recount(
  orgId: string,
  conversationIds: string[],
  readMap: Record<string, string>,
  currentUserId: string
): Map<string, number> {
  const next = new Map<string, number>();
  for (const convId of conversationIds) {
    const messages = getCachedChatMessages(orgId, convId) ?? [];
    const readAt = readMap[convId];
    next.set(convId, countUnreadChatMessages(messages, readAt, currentUserId));
  }
  return next;
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

/** Unread message counts for docked bubbles (uses the shared message cache). */
export function useChatDockUnreadCounts(
  _db: Firestore | null,
  orgId: string,
  conversationIds: string[],
  readMap: Record<string, string>,
  currentUserId: string
): Map<string, number> {
  const idsKey = conversationIds.join("|");
  const readKey = conversationIds.map((id) => `${id}:${readMap[id] ?? ""}`).join("|");

  const argsRef = useRef({ orgId, conversationIds, readMap, currentUserId });
  argsRef.current = { orgId, conversationIds, readMap, currentUserId };

  const [counts, setCounts] = useState<Map<string, number>>(() =>
    recount(orgId, conversationIds, readMap, currentUserId)
  );

  useEffect(() => {
    const update = () => {
      const { orgId: o, conversationIds: ids, readMap: rm, currentUserId: uid } = argsRef.current;
      const next = recount(o, ids, rm, uid);
      setCounts((prev) => (mapsEqual(prev, next) ? prev : next));
    };
    update();
    return subscribeChatMessageCache(update);
  }, [idsKey, readKey, currentUserId]);

  return counts;
}
