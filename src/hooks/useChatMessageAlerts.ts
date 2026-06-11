import { useEffect, useRef } from "react";
import type { AppNotification } from "../types";
import {
  buildNotificationSnapshot,
  hasUnreadAlertChanges,
  scheduleChatNotificationSound,
} from "../utils/notificationAlert";

/** Chat message alert sound — separate from task/comment notifications. */
export function useChatMessageAlerts(notifications: AppNotification[], enabled: boolean) {
  const snapshotRef = useRef<Map<string, string> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      snapshotRef.current = null;
      initializedRef.current = false;
      return;
    }

    const chatNotifs = notifications.filter((n) => n.kind === "chat_message");
    const snapshot = buildNotificationSnapshot(chatNotifs);
    const prev = initializedRef.current ? snapshotRef.current : null;

    if (hasUnreadAlertChanges(chatNotifs, prev)) {
      scheduleChatNotificationSound();
    }

    snapshotRef.current = snapshot;
    initializedRef.current = true;
  }, [notifications, enabled]);
}
