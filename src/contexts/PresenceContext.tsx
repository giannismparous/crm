import { createContext, useContext, type ReactNode } from "react";
import { getFirestoreDb, SIMASIA_AI_ORG_ID } from "../firebase/config";
import { useOrgPresence } from "../hooks/usePresence";
import type { PersonPresence } from "../types";

const PresenceContext = createContext<Map<string, PersonPresence>>(new Map());

export function PresenceProvider({
  userId,
  enabled,
  children,
}: {
  userId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const db = getFirestoreDb();
  const presenceMap = useOrgPresence(db, SIMASIA_AI_ORG_ID, userId || undefined, enabled && Boolean(userId));
  return <PresenceContext.Provider value={presenceMap}>{children}</PresenceContext.Provider>;
}

export function usePresenceMap(): Map<string, PersonPresence> {
  return useContext(PresenceContext);
}
