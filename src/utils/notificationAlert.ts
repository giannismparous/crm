import type { AppNotification } from "../types";

export const APP_TITLE = "SimasiaAI CRM";

const SOUND_DEBOUNCE_MS = 150;
const SOUND_COOLDOWN_MS = 700;

let audioCtx: AudioContext | null = null;
let audioPrimed = false;
let pendingSound = false;
let soundDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSoundAt = 0;

function runNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(740, t0);
    osc.frequency.exponentialRampToValueAtTime(988, t0 + 0.12);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.07, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.36);
    lastSoundAt = Date.now();
  } catch {
    /* ignore */
  }
}

/** Browsers often block audio until after a user gesture. */
export function primeNotificationAudio() {
  audioPrimed = true;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    /* ignore */
  }
  if (pendingSound) {
    pendingSound = false;
    runNotificationSound();
  }
}

/** One chime per burst — multiple new notifs in one snapshot still play once. */
export function scheduleNotificationSound() {
  if (!audioPrimed) {
    pendingSound = true;
    return;
  }
  if (soundDebounceTimer) clearTimeout(soundDebounceTimer);
  soundDebounceTimer = setTimeout(() => {
    soundDebounceTimer = null;
    if (Date.now() - lastSoundAt < SOUND_COOLDOWN_MS) return;
    runNotificationSound();
  }, SOUND_DEBOUNCE_MS);
}

export function syncTabNotificationBadge(unreadCount: number) {
  document.title = unreadCount > 0 ? `(${unreadCount}) ${APP_TITLE}` : APP_TITLE;

  const nav = navigator as Navigator & {
    setAppBadge?: (count: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (unreadCount > 0 && typeof nav.setAppBadge === "function") {
    void nav.setAppBadge(unreadCount);
  } else if (typeof nav.clearAppBadge === "function") {
    void nav.clearAppBadge();
  }
}

export function clearTabNotificationBadge() {
  document.title = APP_TITLE;
  const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  if (typeof nav.clearAppBadge === "function") void nav.clearAppBadge();
}

export function resetNotificationAlertState() {
  pendingSound = false;
  if (soundDebounceTimer) {
    clearTimeout(soundDebounceTimer);
    soundDebounceTimer = null;
  }
}

/** True if any unread is new or was bumped (same id, newer createdAt). */
export function hasUnreadAlertChanges(
  notifications: AppNotification[],
  prevSnapshot: Map<string, string> | null
): boolean {
  if (prevSnapshot === null) {
    return notifications.some((n) => !n.read);
  }

  for (const n of notifications) {
    if (n.read) continue;
    const prevAt = prevSnapshot.get(n.id);
    if (!prevAt || prevAt !== n.createdAt) return true;
  }
  return false;
}

export function buildNotificationSnapshot(notifications: AppNotification[]): Map<string, string> {
  return new Map(notifications.map((n) => [n.id, n.createdAt]));
}
