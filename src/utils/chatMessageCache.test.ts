import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types";
import { mergeChatMessages, MESSAGE_LOAD_MORE, MESSAGE_PAGE } from "./chatMessageCache";

function m(id: string, at: string): ChatMessage {
  return {
    id,
    conversationId: "c1",
    authorId: "u1",
    body: id,
    createdAt: at,
  };
}

describe("chatMessageCache", () => {
  it("exports pagination constants", () => {
    expect(MESSAGE_PAGE).toBe(80);
    expect(MESSAGE_LOAD_MORE).toBe(50);
  });

  it("mergeChatMessages dedupes by id and sorts by createdAt", () => {
    const a = [m("1", "2024-01-01T10:00:00.000Z"), m("2", "2024-01-01T11:00:00.000Z")];
    const b = [m("2", "2024-01-01T11:30:00.000Z"), m("3", "2024-01-01T12:00:00.000Z")];
    const merged = mergeChatMessages(a, b);
    expect(merged.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(merged[1]!.createdAt).toBe("2024-01-01T11:30:00.000Z");
  });
});
