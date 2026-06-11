import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { canSeeAllOrgData } from "../auth/roles";
import { translateDepartment } from "../i18n/helpers";
import { loadLocale } from "../i18n/localeStorage";
import { translate } from "../i18n/translate";
import type { ChatConversation, ChatConversationKind, ChatMemberState, ChatMessage, Person } from "../types";
import type { ImageAttachment } from "../types";
import { attachmentMediaKind, deleteImagesFromStorage, normalizeImageAttachments } from "../utils/imageAttachments";
import { toIso } from "./normalizeFirestore";

export const FOUNDERS_CHAT_ID = "founders";
export const FOUNDERS_CHAT_TITLE = "Founders";

export function dmKeyForMembers(memberIds: string[]): string {
  return [...new Set(memberIds.filter(Boolean))].sort().join("_");
}

export function normalizeChatConversation(id: string, data: Record<string, unknown>): ChatConversation {
  const kind = String(data.kind ?? "group") as ChatConversationKind;
  const memberIds = Array.isArray(data.memberIds)
    ? [...new Set(data.memberIds.map((x) => String(x).trim()).filter(Boolean))]
    : [];
  return {
    id,
    kind: kind === "founders" || kind === "dm" || kind === "group" ? kind : "group",
    memberIds,
    createdById: String(data.createdById ?? ""),
    createdAt: toIso(data.createdAt),
    title: typeof data.title === "string" ? data.title.trim() : undefined,
    dmKey: typeof data.dmKey === "string" ? data.dmKey.trim() : undefined,
    participantIds: Array.isArray(data.participantIds)
      ? [...new Set(data.participantIds.map((x) => String(x).trim()).filter(Boolean))]
      : undefined,
    departmentIds: Array.isArray(data.departmentIds)
      ? [...new Set(data.departmentIds.map((x) => String(x).trim()).filter(Boolean))]
      : undefined,
    groupKey: typeof data.groupKey === "string" ? data.groupKey.trim() : undefined,
    lastMessageAt: toIso(data.lastMessageAt) || undefined,
    lastMessagePreview: typeof data.lastMessagePreview === "string" ? data.lastMessagePreview : undefined,
    lastMessageAuthorId:
      typeof data.lastMessageAuthorId === "string" ? data.lastMessageAuthorId : undefined,
  };
}

export function normalizeChatMessage(
  conversationId: string,
  id: string,
  data: Record<string, unknown>
): ChatMessage {
  return {
    id,
    conversationId,
    authorId: String(data.authorId ?? ""),
    body: String(data.body ?? ""),
    createdAt: toIso(data.createdAt),
    createdAtMs: typeof data.createdAtMs === "number" ? data.createdAtMs : undefined,
    attachments: normalizeImageAttachments(data.attachments),
  };
}

/** Delete a message and its storage files; refresh conversation preview. */
export async function unsendChatMessage(
  db: Firestore,
  orgId: string,
  conversationId: string,
  message: ChatMessage
): Promise<void> {
  const storagePaths = (message.attachments ?? []).map((a) => a.storagePath).filter(Boolean);

  const msgRef = doc(
    db,
    "organizations",
    orgId,
    "chatConversations",
    conversationId,
    "messages",
    message.id
  );
  await deleteDoc(msgRef);

  if (storagePaths.length > 0) {
    await deleteImagesFromStorage(storagePaths);
  }

  const convRef = doc(db, "organizations", orgId, "chatConversations", conversationId);
  const remainingQ = query(
    collection(db, "organizations", orgId, "chatConversations", conversationId, "messages"),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const remainingSnap = await getDocs(remainingQ);
  if (remainingSnap.empty) {
    await updateDoc(convRef, {
      lastMessageAt: deleteField(),
      lastMessagePreview: deleteField(),
      lastMessageAuthorId: deleteField(),
    });
    return;
  }

  const lastDoc = remainingSnap.docs[0]!;
  const last = normalizeChatMessage(conversationId, lastDoc.id, lastDoc.data() as Record<string, unknown>);
  await updateDoc(convRef, {
    lastMessageAt: last.createdAt,
    lastMessagePreview: chatMessagePreview(last.body, last.attachments),
    lastMessageAuthorId: last.authorId,
  });
}

export function chatMessagePreview(body: string, attachments: ImageAttachment[] = []): string {
  const text = body.trim();
  if (text) return text.slice(0, 240);
  if (attachments.length === 0) return "";
  const locale = loadLocale();
  const kind = attachmentMediaKind(attachments[0]!);
  const n = attachments.length;
  const label =
    kind === "video"
      ? translate(locale, "chat.attachment.video")
      : kind === "audio"
        ? translate(locale, "chat.attachment.audio")
        : kind === "file"
          ? translate(locale, "chat.attachment.file")
          : translate(locale, "chat.attachment.photo");
  return n > 1 ? translate(locale, "chat.attachment.nAttachments", { count: n }) : label;
}

export function normalizeChatMemberState(userId: string, data: Record<string, unknown>): ChatMemberState {
  const readByConversation: Record<string, string> = {};
  const raw = data.readByConversation;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const at = toIso(v);
      if (k.trim() && at) readByConversation[k.trim()] = at;
    }
  }
  return {
    userId,
    readByConversation,
    updatedAt: toIso(data.updatedAt),
  };
}

export function founderIdsFromPeople(people: Person[]): string[] {
  return [...new Set(people.filter((p) => canSeeAllOrgData(p.orgRole)).map((p) => p.id).filter(Boolean))].sort();
}

/** Ensure the org-wide founders channel exists and includes every current founder. */
export async function ensureFoundersChat(db: Firestore, orgId: string, people: Person[]): Promise<void> {
  const founderIds = founderIdsFromPeople(people);
  if (founderIds.length === 0) return;

  const ref = doc(db, "organizations", orgId, "chatConversations", FOUNDERS_CHAT_ID);
  const snap = await getDoc(ref);
  const now = new Date().toISOString();

  if (!snap.exists()) {
    await setDoc(ref, {
      id: FOUNDERS_CHAT_ID,
      kind: "founders",
      memberIds: founderIds,
      createdById: founderIds[0],
      createdAt: now,
      title: FOUNDERS_CHAT_TITLE,
    });
    return;
  }

  const existing = normalizeChatConversation(FOUNDERS_CHAT_ID, snap.data() as Record<string, unknown>);
  const merged = [...new Set([...existing.memberIds, ...founderIds])].sort();
  if (merged.length !== existing.memberIds.length || merged.some((id, i) => id !== existing.memberIds[i])) {
    await updateDoc(ref, { memberIds: merged });
  }
}

export async function findGroupConversation(
  db: Firestore,
  orgId: string,
  groupKey: string
): Promise<ChatConversation | null> {
  const key = groupKey.trim();
  if (!key) return null;
  const q = query(
    collection(db, "organizations", orgId, "chatConversations"),
    where("kind", "==", "group"),
    where("groupKey", "==", key)
  );
  const snap = await getDocs(q);
  const first = snap.docs[0];
  if (!first) return null;
  return normalizeChatConversation(first.id, first.data() as Record<string, unknown>);
}

export async function findDmConversation(
  db: Firestore,
  orgId: string,
  memberIds: string[]
): Promise<ChatConversation | null> {
  const key = dmKeyForMembers(memberIds);
  if (!key) return null;
  const q = query(
    collection(db, "organizations", orgId, "chatConversations"),
    where("kind", "==", "dm"),
    where("dmKey", "==", key)
  );
  const snap = await getDocs(q);
  const first = snap.docs[0];
  if (!first) return null;
  return normalizeChatConversation(first.id, first.data() as Record<string, unknown>);
}

export function conversationDisplayTitle(
  conv: ChatConversation,
  people: Person[],
  currentUserId: string
): string {
  const locale = loadLocale();
  if (conv.kind === "founders") return translate(locale, "chat.founders");
  if (conv.title?.trim()) return conv.title.trim();
  if (conv.kind === "dm") {
    const otherId = conv.memberIds.find((id) => id !== currentUserId);
    const other = people.find((p) => p.id === otherId);
    return other?.name.trim() || other?.email.trim() || translate(locale, "chat.directMessage");
  }
  const deptPart =
    conv.departmentIds && conv.departmentIds.length > 0
      ? conv.departmentIds.map((d) => translateDepartment(locale, d)).join(", ")
      : "";
  const names = conv.memberIds
    .filter((id) => id !== currentUserId)
    .map((id) => people.find((p) => p.id === id)?.name.trim())
    .filter(Boolean);
  if (deptPart && names.length === 0) return deptPart;
  if (deptPart && names.length > 0) {
    const peoplePart = names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    return `${deptPart} · ${peoplePart}`;
  }
  if (names.length === 0) return translate(locale, "chat.groupChat");
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export function isConversationUnread(
  conv: ChatConversation,
  readByConversation: Record<string, string> | undefined
): boolean {
  if (!conv.lastMessageAt) return false;
  const readAt = readByConversation?.[conv.id];
  if (!readAt) return true;
  return readAt < conv.lastMessageAt;
}

/** Count messages from others that are newer than the read cursor. */
export function countUnreadChatMessages(
  messages: ChatMessage[],
  readAt: string | undefined,
  currentUserId: string
): number {
  return messages.filter(
    (m) => m.authorId !== currentUserId && (!readAt || m.createdAt > readAt)
  ).length;
}

export function conversationUnreadMessageCount(
  conv: ChatConversation,
  readByConversation: Record<string, string> | undefined,
  currentUserId: string,
  messages?: ChatMessage[]
): number {
  if (!isConversationUnread(conv, readByConversation)) return 0;
  if (messages && messages.length > 0) {
    const n = countUnreadChatMessages(messages, readByConversation?.[conv.id], currentUserId);
    if (n > 0) return n;
  }
  return 1;
}

/** True when every other member has read up to this message time */
export function messageReadByAllOthers(
  message: ChatMessage,
  conversation: ChatConversation,
  memberReadStates: Map<string, ChatMemberState>,
  currentUserId: string
): boolean {
  const others = conversation.memberIds.filter((id) => id !== currentUserId);
  if (others.length === 0) return true;
  return others.every((id) => {
    const cursor = memberReadStates.get(id)?.readByConversation[conversation.id];
    return Boolean(cursor && cursor >= message.createdAt);
  });
}
