import { useEffect, useRef } from "react";
import type { AppNotification } from "../types";
import {
  buildNotificationSnapshot,
  clearTabNotificationBadge,
  hasUnreadAlertChanges,
  primeNotificationAudio,
  resetNotificationAlertState,
  scheduleNotificationSound,
  syncTabNotificationBadge,
} from "../utils/notificationAlert";

/** Tab title / badge + alert sound. Notifications list is already live via Firestore onSnapshot. */
export function useNotificationAlerts(notifications: AppNotification[], enabled: boolean) {
  const snapshotRef = useRef<Map<string, string> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const prime = () => primeNotificationAudio();
    document.addEventListener("click", prime, { once: true });
    document.addEventListener("keydown", prime, { once: true });
    return () => {
      document.removeEventListener("click", prime);
      document.removeEventListener("keydown", prime);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      snapshotRef.current = null;
      initializedRef.current = false;
      resetNotificationAlertState();
      clearTabNotificationBadge();
      return;
    }

    const unreadCount = notifications.filter((n) => !n.read).length;
    syncTabNotificationBadge(unreadCount);

    const snapshot = buildNotificationSnapshot(notifications);
    const prev = initializedRef.current ? snapshotRef.current : null;

    if (hasUnreadAlertChanges(notifications, prev)) {
      scheduleNotificationSound();
    }

    snapshotRef.current = snapshot;
    initializedRef.current = true;
  }, [notifications, enabled]);

  useEffect(() => {
    return () => clearTabNotificationBadge();
  }, []);
}
