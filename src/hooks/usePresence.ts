import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { PersonPresence } from "../types";
import { toIso } from "../firebase/normalizeFirestore";
import { getActiveTimezone } from "../utils/orgTimezone";
import { isValidTimezone } from "../utils/userTimezone";

export const HEARTBEAT_MS = 30_000;
export const ONLINE_STALE_MS = 45_000;
const PRESENCE_SNAPSHOT_DEBOUNCE_MS = 250;

function normalizePresence(userId: string, data: Record<string, unknown>): PersonPresence {
  const lastSeenAt = toIso(data.lastSeenAt);
  const tzRaw = String(data.timezone ?? "").trim();
  const timezone = tzRaw && isValidTimezone(tzRaw) ? tzRaw : undefined;
  return {
    userId,
    online: data.online === true,
    lastSeenAt,
    ...(timezone ? { timezone } : {}),
  };
}

function presenceMapsEqual(a: Map<string, PersonPresence>, b: Map<string, PersonPresence>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, left] of a) {
    const right = b.get(id);
    if (!right) return false;
    if (
      left.online !== right.online ||
      left.lastSeenAt !== right.lastSeenAt ||
      left.timezone !== right.timezone
    ) {
      return false;
    }
  }
  return true;
}

export function isPresenceOnline(presence: PersonPresence | undefined, nowMs = Date.now()): boolean {
  if (!presence) return false;
  if (!presence.lastSeenAt) return presence.online;
  const seenMs = new Date(presence.lastSeenAt).getTime();
  if (Number.isNaN(seenMs)) return false;
  return presence.online && nowMs - seenMs < ONLINE_STALE_MS;
}

/** Mark self online while CRM tab is open; subscribe to org presence map. */
export function useOrgPresence(
  db: Firestore | null,
  orgId: string,
  userId: string | undefined,
  enabled: boolean
): Map<string, PersonPresence> {
  const [presenceMap, setPresenceMap] = useState<Map<string, PersonPresence>>(() => new Map());

  useEffect(() => {
    if (!db || !userId || !enabled) {
      setPresenceMap(new Map());
      return;
    }

    const ref = doc(db, "organizations", orgId, "presence", userId);
    let disposed = false;

    async function pulse(online: boolean) {
      if (disposed) return;
      try {
        await setDoc(
          ref,
          {
            userId,
            online,
            lastSeenAt: new Date().toISOString(),
            timezone: getActiveTimezone(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        /* offline / permission */
      }
    }

    void pulse(true);
    const heartbeat = window.setInterval(() => void pulse(true), HEARTBEAT_MS);

    function goOffline() {
      void pulse(false);
    }
    window.addEventListener("pagehide", goOffline);
    window.addEventListener("beforeunload", goOffline);

    const col = collection(db, "organizations", orgId, "presence");
    let debounceTimer: number | null = null;
    let pendingMap: Map<string, PersonPresence> | null = null;

    const flushPresence = () => {
      debounceTimer = null;
      if (!pendingMap) return;
      const next = pendingMap;
      pendingMap = null;
      setPresenceMap((prev) => (presenceMapsEqual(prev, next) ? prev : next));
    };

    const unsub = onSnapshot(
      col,
      (snap) => {
        const next = new Map<string, PersonPresence>();
        for (const d of snap.docs) {
          next.set(d.id, normalizePresence(d.id, d.data() as Record<string, unknown>));
        }
        pendingMap = next;
        if (debounceTimer !== null) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(flushPresence, PRESENCE_SNAPSHOT_DEBOUNCE_MS);
      },
      () => setPresenceMap((prev) => (prev.size === 0 ? prev : new Map()))
    );

    return () => {
      disposed = true;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", goOffline);
      window.removeEventListener("beforeunload", goOffline);
      void pulse(false);
      unsub();
    };
  }, [db, orgId, userId, enabled]);

  return presenceMap;
}

export function usePresenceTick(enabled = true, intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

export function useOnlinePersonIds(
  presenceMap: Map<string, PersonPresence>,
  nowMs: number
): Set<string> {
  return useMemo(() => {
    const ids = new Set<string>();
    for (const [id, p] of presenceMap) {
      if (isPresenceOnline(p, nowMs)) ids.add(id);
    }
    return ids;
  }, [presenceMap, nowMs]);
}
