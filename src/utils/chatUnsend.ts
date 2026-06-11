import type { ChatMessage } from "../types";

export const CHAT_UNSEND_WINDOW_MS = 5 * 60 * 1000;

export function chatMessageCreatedAtMs(message: ChatMessage): number {
  if (typeof message.createdAtMs === "number" && Number.isFinite(message.createdAtMs)) {
    return message.createdAtMs;
  }
  const parsed = Date.parse(message.createdAt);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function canUnsendChatMessage(
  message: ChatMessage,
  userId: string,
  nowMs: number = Date.now()
): boolean {
  if (!userId || message.authorId !== userId) return false;
  // Firestore rules require createdAtMs — legacy messages without it cannot unsend.
  if (typeof message.createdAtMs !== "number" || !Number.isFinite(message.createdAtMs)) return false;
  return nowMs - message.createdAtMs <= CHAT_UNSEND_WINDOW_MS;
}
