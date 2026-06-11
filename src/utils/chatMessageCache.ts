import type { ChatMessage } from "../types";

/** Live window size (most recent messages). */
export const MESSAGE_PAGE = 80;
/** Older messages loaded per "Load more" click. */
export const MESSAGE_LOAD_MORE = 50;

const messageCache = new Map<string, ChatMessage[]>();
const cacheListeners = new Set<() => void>();

function notifyCacheListeners() {
  for (const listener of cacheListeners) listener();
}

export function chatMessageCacheKey(orgId: string, conversationId: string): string {
  return `${orgId}:${conversationId}`;
}

export function getCachedChatMessages(orgId: string, conversationId: string): ChatMessage[] | undefined {
  return messageCache.get(chatMessageCacheKey(orgId, conversationId));
}

export function setCachedChatMessages(orgId: string, conversationId: string, messages: ChatMessage[]): void {
  messageCache.set(chatMessageCacheKey(orgId, conversationId), messages);
  notifyCacheListeners();
}

export function subscribeChatMessageCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function clearChatMessageCache(orgId: string, conversationId: string): void {
  messageCache.delete(chatMessageCacheKey(orgId, conversationId));
}
