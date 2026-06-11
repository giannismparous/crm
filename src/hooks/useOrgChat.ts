import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { canSeeAllOrgData, type OrgRole } from "../auth/roles";
import {
  chatMessagePreview,
  conversationDisplayTitle,
  ensureFoundersChat,
  findDmConversation,
  findGroupConversation,
  normalizeChatConversation,
  normalizeChatMemberState,
  unsendChatMessage,
} from "../firebase/chat";
import { createNotificationsForChatMessage } from "../firebase/notifications";
import type { ChatConversation, ChatMemberState, ChatMessage, ImageAttachment, Person } from "../types";
import { imageAttachmentsForFirestore } from "../utils/imageAttachments";
import { canMessagePerson } from "../utils/chatVisibility";
import { groupKeyForSelection, resolveGroupMemberIds } from "../utils/chatGroup";
import { normalizeAssigneeDepartments } from "../utils/taskAssignees";
import { useChatWindowMessages } from "./useChatWindowMessages";
import { canUnsendChatMessage } from "../utils/chatUnsend";
import { loadLocale } from "../i18n/localeStorage";
import { translate } from "../i18n/translate";

export function useOrgChat({
  db,
  orgId,
  currentUserId,
  currentUserOrgRole,
  people,
  enabled,
}: {
  db: Firestore | null;
  orgId: string;
  currentUserId: string;
  currentUserOrgRole: OrgRole;
  people: Person[];
  enabled: boolean;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const { messages } = useChatWindowMessages(
    db,
    orgId,
    activeConversationId,
    enabled && Boolean(activeConversationId)
  );
  const [myMemberState, setMyMemberState] = useState<ChatMemberState | null>(null);
  const [peerMemberStates, setPeerMemberStates] = useState<Map<string, ChatMemberState>>(() => new Map());
  const currentUserPerson = useMemo(
    () => people.find((p) => p.id === currentUserId),
    [people, currentUserId]
  );

  useEffect(() => {
    if (!db || !enabled || !canSeeAllOrgData(currentUserOrgRole)) return;
    void ensureFoundersChat(db, orgId, people).catch((e) => {
      const code = (e as { code?: string })?.code;
      if (code === "permission-denied") return;
      console.error("ensureFoundersChat", e);
    });
  }, [db, orgId, people, enabled, currentUserOrgRole]);

  useEffect(() => {
    if (!db || !enabled || !currentUserId) {
      setConversations([]);
      return;
    }
    const q = query(
      collection(db, "organizations", orgId, "chatConversations"),
      where("memberIds", "array-contains", currentUserId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) =>
          normalizeChatConversation(d.id, d.data() as Record<string, unknown>)
        );
        list.sort((a, b) => {
          const kindOrder = (c: ChatConversation) => (c.kind === "founders" ? 0 : 1);
          const ko = kindOrder(a) - kindOrder(b);
          if (ko !== 0) return ko;
          const ta = a.lastMessageAt ?? a.createdAt;
          const tb = b.lastMessageAt ?? b.createdAt;
          return tb.localeCompare(ta);
        });
        setConversations(list);
      },
      () => setConversations([])
    );
    return () => unsub();
  }, [db, orgId, currentUserId, enabled]);

  useEffect(() => {
    if (!db || !enabled || !currentUserId) {
      setMyMemberState(null);
      return;
    }
    const ref = doc(db, "organizations", orgId, "chatMemberState", currentUserId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setMyMemberState({ userId: currentUserId, readByConversation: {}, updatedAt: "" });
          return;
        }
        setMyMemberState(normalizeChatMemberState(currentUserId, snap.data() as Record<string, unknown>));
      },
      () => setMyMemberState(null)
    );
    return () => unsub();
  }, [db, orgId, currentUserId, enabled]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const activePeerIds = useMemo(() => {
    if (!activeConversation) return [];
    return activeConversation.memberIds.filter((id) => id !== currentUserId);
  }, [activeConversation, currentUserId]);

  useEffect(() => {
    if (!db || !enabled || activePeerIds.length === 0) {
      setPeerMemberStates(new Map());
      return;
    }
    const unsubs = activePeerIds.map((peerId) => {
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
  }, [db, orgId, enabled, activePeerIds.join("|")]);

  const markConversationRead = useCallback(
    async (conversationId: string, at?: string) => {
      if (!db || !currentUserId || !conversationId) return;
      const readAt = at ?? new Date().toISOString();
      const ref = doc(db, "organizations", orgId, "chatMemberState", currentUserId);
      await setDoc(ref, { userId: currentUserId }, { merge: true });
      await updateDoc(ref, { [`readByConversation.${conversationId}`]: readAt, updatedAt: readAt });
    },
    [db, orgId, currentUserId]
  );

  useEffect(() => {
    if (!activeConversationId || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    void markConversationRead(activeConversationId, last.createdAt);
  }, [activeConversationId, messages, markConversationRead]);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      payload: { body: string; attachments?: ImageAttachment[] }
    ) => {
      if (!db || !currentUserId) return;
      const text = payload.body.trim();
      const attachments = payload.attachments ?? [];
      if (!text && attachments.length === 0) return;
      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv) {
        throw new Error(translate(loadLocale(), "chat.error.loading"));
      }

      const now = new Date().toISOString();
      const createdAtMs = Date.now();
      const msgRef = doc(collection(db, "organizations", orgId, "chatConversations", conversationId, "messages"));
      const messageId = msgRef.id;
      await setDoc(msgRef, {
        id: messageId,
        authorId: currentUserId,
        body: text,
        createdAt: now,
        createdAtMs,
        ...(attachments.length > 0 ? { attachments: imageAttachmentsForFirestore(attachments) } : {}),
      });
      const preview = chatMessagePreview(text, attachments);
      await updateDoc(doc(db, "organizations", orgId, "chatConversations", conversationId), {
        lastMessageAt: now,
        lastMessagePreview: preview,
        lastMessageAuthorId: currentUserId,
      });
      await markConversationRead(conversationId, now);

      const author = people.find((p) => p.id === currentUserId);
      const authorName =
        author?.name.trim() || author?.email.trim() || translate(loadLocale(), "common.someone");
      await createNotificationsForChatMessage(db, orgId, {
        messageId,
        conversationId,
        conversationTitle: conversationDisplayTitle(conv, people, currentUserId),
        authorId: currentUserId,
        authorName,
        body: preview,
        memberIds: conv.memberIds,
        createdAt: now,
      });
    },
    [db, orgId, currentUserId, conversations, markConversationRead, people]
  );

  const unsendMessage = useCallback(
    async (conversationId: string, message: ChatMessage) => {
      if (!db || !currentUserId) return;
      if (message.authorId !== currentUserId) {
        throw new Error(translate(loadLocale(), "chat.error.unsendOwn"));
      }
      if (!canUnsendChatMessage(message, currentUserId)) {
        throw new Error(translate(loadLocale(), "chat.error.unsendExpired"));
      }
      await unsendChatMessage(db, orgId, conversationId, message);
    },
    [db, orgId, currentUserId]
  );

  const openOrCreateDm = useCallback(
    async (otherPersonId: string): Promise<string> => {
      if (!db || !currentUserId) return "";
      const other = people.find((p) => p.id === otherPersonId);
      if (!other || !canMessagePerson(other, currentUserPerson, currentUserId, currentUserOrgRole)) {
        throw new Error(translate(loadLocale(), "chat.error.cannotMessage"));
      }
      const existing = await findDmConversation(db, orgId, [currentUserId, otherPersonId]);
      if (existing) return existing.id;

      const now = new Date().toISOString();
      const ref = doc(collection(db, "organizations", orgId, "chatConversations"));
      const memberIds = [currentUserId, otherPersonId].sort();
      await setDoc(ref, {
        id: ref.id,
        kind: "dm",
        memberIds,
        dmKey: memberIds.join("_"),
        createdById: currentUserId,
        createdAt: now,
      });
      return ref.id;
    },
    [db, orgId, currentUserId, currentUserPerson, currentUserOrgRole, people]
  );

  const createGroupChat = useCallback(
    async (participantIds: string[], departmentIds: string[], title: string): Promise<string> => {
      if (!db || !currentUserId) return "";

      const pickedPeople = [...new Set(participantIds.filter((id) => id && id !== currentUserId))];
      const pickedDepartments = normalizeAssigneeDepartments(departmentIds);
      if (pickedPeople.length === 0 && pickedDepartments.length === 0) {
        throw new Error(translate(loadLocale(), "chat.error.pickParticipant"));
      }

      const memberIds = resolveGroupMemberIds(
        currentUserId,
        pickedPeople,
        pickedDepartments,
        people
      );
      if (memberIds.length < 2) {
        throw new Error(translate(loadLocale(), "chat.error.needOtherPerson"));
      }

      const groupKey = groupKeyForSelection(pickedPeople, pickedDepartments, currentUserId);
      const existingByKey = await findGroupConversation(db, orgId, groupKey);
      if (existingByKey) return existingByKey.id;

      if (pickedDepartments.length === 0) {
        const memberSig = memberIds.join("\0");
        const legacy = conversations.find(
          (c) =>
            c.kind === "group" &&
            (!c.departmentIds || c.departmentIds.length === 0) &&
            [...c.memberIds].sort().join("\0") === memberSig
        );
        if (legacy) return legacy.id;
      }

      for (const id of memberIds) {
        if (id === currentUserId) continue;
        const person = people.find((p) => p.id === id);
        if (!person || !canMessagePerson(person, currentUserPerson, currentUserId, currentUserOrgRole)) {
          throw new Error(translate(loadLocale(), "chat.error.cannotAdd"));
        }
      }

      const now = new Date().toISOString();
      const ref = doc(collection(db, "organizations", orgId, "chatConversations"));
      await setDoc(ref, {
        id: ref.id,
        kind: "group",
        memberIds,
        participantIds: pickedPeople,
        ...(pickedDepartments.length > 0 ? { departmentIds: pickedDepartments } : {}),
        groupKey,
        title: title.trim() || translate(loadLocale(), "chat.groupChat"),
        createdById: currentUserId,
        createdAt: now,
      });
      return ref.id;
    },
    [db, orgId, currentUserId, currentUserPerson, currentUserOrgRole, people, conversations]
  );

  const totalUnread = useMemo(() => {
    const read = myMemberState?.readByConversation ?? {};
    return conversations.filter((c) => {
      if (!c.lastMessageAt) return false;
      if (c.lastMessageAuthorId === currentUserId) return false;
      const readAt = read[c.id];
      return !readAt || readAt < c.lastMessageAt;
    }).length;
  }, [conversations, myMemberState, currentUserId]);

  return {
    conversations,
    messages,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    myMemberState,
    peerMemberStates,
    sendMessage,
    unsendMessage,
    openOrCreateDm,
    createGroupChat,
    markConversationRead,
    totalUnread,
  };
}

export type SendChatMessagePayload = { body: string; attachments?: ImageAttachment[] };
