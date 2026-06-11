import { useEffect, useState } from "react";
import { doc, onSnapshot, type Firestore } from "firebase/firestore";
import { normalizeChatMemberState } from "../firebase/chat";
import type { ChatConversation, ChatMemberState } from "../types";

export function useChatPeerReadStates(
  db: Firestore | null,
  orgId: string,
  conversation: ChatConversation | undefined,
  currentUserId: string,
  enabled: boolean
): Map<string, ChatMemberState> {
  const [peerMemberStates, setPeerMemberStates] = useState<Map<string, ChatMemberState>>(
    () => new Map()
  );

  const peerIds = conversation?.memberIds.filter((id) => id !== currentUserId) ?? [];

  useEffect(() => {
    if (!db || !enabled || peerIds.length === 0) {
      setPeerMemberStates(new Map());
      return;
    }
    const unsubs = peerIds.map((peerId) => {
      const ref = doc(db, "organizations", orgId, "chatMemberState", peerId);
      return onSnapshot(ref, (snap) => {
        setPeerMemberStates((prev) => {
          const next = new Map(prev);
          if (!snap.exists()) {
            next.delete(peerId);
            return next;
          }
          next.set(peerId, normalizeChatMemberState(peerId, snap.data() as Record<string, unknown>));
          return next;
        });
      });
    });
    return () => {
      for (const u of unsubs) u();
      setPeerMemberStates(new Map());
    };
  }, [db, orgId, enabled, peerIds.join("|")]);

  return peerMemberStates;
}
