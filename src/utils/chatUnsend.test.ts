import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types";
import { canUnsendChatMessage, CHAT_UNSEND_WINDOW_MS, chatMessageCreatedAtMs } from "./chatUnsend";

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    conversationId: "c1",
    authorId: "u1",
    body: "hi",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("chatUnsend", () => {
  it("allows author within 5 minutes when createdAtMs exists", () => {
    const now = 1_700_000_000_000;
    const m = msg({ authorId: "u1", createdAtMs: now - 60_000 });
    expect(canUnsendChatMessage(m, "u1", now)).toBe(true);
  });

  it("denies after 5 minutes", () => {
    const now = 1_700_000_000_000;
    const m = msg({ authorId: "u1", createdAtMs: now - CHAT_UNSEND_WINDOW_MS - 1 });
    expect(canUnsendChatMessage(m, "u1", now)).toBe(false);
  });

  it("denies non-author", () => {
    const now = Date.now();
    const m = msg({ authorId: "u1", createdAtMs: now });
    expect(canUnsendChatMessage(m, "u2", now)).toBe(false);
  });

  it("denies when createdAtMs is missing", () => {
    const now = Date.now();
    const m = msg({ authorId: "u1" });
    expect(canUnsendChatMessage(m, "u1", now)).toBe(false);
  });

  it("parses createdAtMs from ISO when present", () => {
    const iso = "2024-06-01T10:00:00.000Z";
    expect(chatMessageCreatedAtMs(msg({ createdAt: iso, createdAtMs: 123 }))).toBe(123);
    expect(chatMessageCreatedAtMs(msg({ createdAt: iso }))).toBe(Date.parse(iso));
  });
});
