import { describe, expect, it } from "vitest";
import { SIMASIA_AI_ORG_ID } from "../firebase/config";
import { NOTIFICATION_INBOX_LIMIT } from "../types";
import { CHAT_UNSEND_WINDOW_MS } from "./chatUnsend";
import { MESSAGE_LOAD_MORE, MESSAGE_PAGE } from "./chatMessageCache";
import { ORG_TIMEZONE } from "./userTimezone";
import { HEARTBEAT_MS, ONLINE_STALE_MS } from "../hooks/usePresence";

describe("system contracts", () => {
  it("org id is SimasiaAI", () => {
    expect(SIMASIA_AI_ORG_ID).toBe("SimasiaAI");
  });

  it("org timezone is Europe/Athens", () => {
    expect(ORG_TIMEZONE).toBe("Europe/Athens");
  });

  it("chat live window is 80", () => {
    expect(MESSAGE_PAGE).toBe(80);
  });

  it("chat load older batch is 50", () => {
    expect(MESSAGE_LOAD_MORE).toBe(50);
  });

  it("chat unsend window is 5 minutes", () => {
    expect(CHAT_UNSEND_WINDOW_MS).toBe(5 * 60 * 1000);
  });

  it("presence heartbeat is 30 seconds", () => {
    expect(HEARTBEAT_MS).toBe(30_000);
  });

  it("presence stale threshold is 45 seconds", () => {
    expect(ONLINE_STALE_MS).toBe(45_000);
  });

  it("notification inbox limit is 50", () => {
    expect(NOTIFICATION_INBOX_LIMIT).toBe(50);
  });
});
