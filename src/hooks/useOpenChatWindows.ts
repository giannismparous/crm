import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "crm-open-chat-windows-v2";
const LEGACY_STORAGE_KEY = "crm-open-chat-windows";
const MAX_BUBBLES_DESKTOP = 6;
const MAX_BUBBLES_MOBILE = 4;

type StoredChatWindows = {
  openIds: string[];
  expandedId: string | null;
};

function readStored(): StoredChatWindows {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        const openIds = Array.isArray(obj.openIds)
          ? obj.openIds.filter((x) => typeof x === "string" && x.trim())
          : [];
        const expandedId =
          typeof obj.expandedId === "string" && obj.expandedId.trim() ? obj.expandedId : null;
        return {
          openIds,
          expandedId: expandedId && openIds.includes(expandedId) ? expandedId : null,
        };
      }
    }

    const legacyRaw = sessionStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as unknown;
      if (Array.isArray(legacy)) {
        return {
          openIds: legacy.filter((x) => typeof x === "string" && x.trim()),
          expandedId: null,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { openIds: [], expandedId: null };
}

function writeStored(state: StoredChatWindows) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function maxBubbles() {
  if (typeof window === "undefined") return MAX_BUBBLES_DESKTOP;
  return window.matchMedia("(max-width: 640px)").matches ? MAX_BUBBLES_MOBILE : MAX_BUBBLES_DESKTOP;
}

function trimOpenIds(ids: string[]): string[] {
  const max = maxBubbles();
  if (ids.length <= max) return ids;
  return ids.slice(ids.length - max);
}

export function useOpenChatWindows() {
  const [openIds, setOpenIds] = useState<string[]>(() => readStored().openIds);
  const [expandedId, setExpandedId] = useState<string | null>(() => readStored().expandedId);

  useEffect(() => {
    writeStored({ openIds, expandedId });
  }, [openIds, expandedId]);

  useEffect(() => {
    if (expandedId && !openIds.includes(expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, openIds]);

  const openWindow = useCallback((conversationId: string) => {
    const id = conversationId.trim();
    if (!id) return;
    setOpenIds((prev) => {
      const without = prev.filter((x) => x !== id);
      return trimOpenIds([...without, id]);
    });
    setExpandedId(id);
  }, []);

  const closeWindow = useCallback((conversationId: string) => {
    setOpenIds((prev) => prev.filter((x) => x !== conversationId));
    setExpandedId((prev) => (prev === conversationId ? null : prev));
  }, []);

  const toggleExpanded = useCallback((conversationId: string) => {
    const id = conversationId.trim();
    if (!id) return;
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const minimizeAll = useCallback(() => {
    setExpandedId(null);
  }, []);

  return {
    openIds,
    expandedId,
    openWindow,
    closeWindow,
    toggleExpanded,
    minimizeAll,
    setOpenIds,
  };
}
