import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  type Firestore,
} from "firebase/firestore";
import { normalizeChatMessage } from "../firebase/chat";
import type { ChatMessage } from "../types";
import {
  getCachedChatMessages,
  mergeChatMessages,
  MESSAGE_LOAD_MORE,
  MESSAGE_PAGE,
  setCachedChatMessages,
} from "../utils/chatMessageCache";

export function useChatWindowMessages(
  db: Firestore | null,
  orgId: string,
  conversationId: string,
  enabled: boolean
): {
  messages: ChatMessage[];
  loading: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
} {
  const key = `${orgId}:${conversationId}`;
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => getCachedChatMessages(orgId, conversationId) ?? []
  );
  const [loading, setLoading] = useState(
    () => enabled && !getCachedChatMessages(orgId, conversationId)
  );
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderRef = useRef<ChatMessage[]>([]);
  const liveRef = useRef<ChatMessage[]>([]);

  const publish = useCallback(
    (older: ChatMessage[], live: ChatMessage[]) => {
      const merged = mergeChatMessages(older, live);
      setCachedChatMessages(orgId, conversationId, merged);
      setMessages(merged);
    },
    [orgId, conversationId]
  );

  useEffect(() => {
    olderRef.current = [];
    liveRef.current = [];
    setHasOlder(false);
    setLoadingOlder(false);
  }, [conversationId]);

  useEffect(() => {
    if (!db || !enabled || !conversationId) {
      setLoading(false);
      return;
    }

    const cached = getCachedChatMessages(orgId, conversationId);
    if (cached) {
      setMessages(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const col = collection(
      db,
      "organizations",
      orgId,
      "chatConversations",
      conversationId,
      "messages"
    );

    const liveQ = query(col, orderBy("createdAt", "asc"), limitToLast(MESSAGE_PAGE));
    const unsub = onSnapshot(
      liveQ,
      (snap) => {
        const live = snap.docs.map((d) =>
          normalizeChatMessage(conversationId, d.id, d.data() as Record<string, unknown>)
        );
        liveRef.current = live;
        publish(olderRef.current, live);
        setHasOlder(snap.docs.length === MESSAGE_PAGE || olderRef.current.length > 0);
        setLoading(false);
      },
      () => {
        if (!getCachedChatMessages(orgId, conversationId)) {
          setMessages([]);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [db, orgId, conversationId, enabled, key, publish]);

  const loadOlder = useCallback(async () => {
    if (!db || !conversationId || loadingOlder) return;
    const oldest = messages[0];
    if (!oldest) return;

    setLoadingOlder(true);
    try {
      const col = collection(
        db,
        "organizations",
        orgId,
        "chatConversations",
        conversationId,
        "messages"
      );
      const olderQ = query(
        col,
        orderBy("createdAt", "desc"),
        startAfter(oldest.createdAt),
        limit(MESSAGE_LOAD_MORE)
      );
      const snap = await getDocs(olderQ);
      if (snap.empty) {
        setHasOlder(false);
        return;
      }
      const batch = snap.docs
        .map((d) =>
          normalizeChatMessage(conversationId, d.id, d.data() as Record<string, unknown>)
        )
        .reverse();
      olderRef.current = mergeChatMessages(batch, olderRef.current);
      publish(olderRef.current, liveRef.current);
      if (snap.docs.length < MESSAGE_LOAD_MORE) {
        setHasOlder(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [db, orgId, conversationId, loadingOlder, messages, publish]);

  return { messages, loading, hasOlder, loadingOlder, loadOlder };
}
