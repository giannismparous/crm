import type { AppNotification } from "../types";

export const APP_TITLE = "SimasiaAI CRM";

const SOUND_DEBOUNCE_MS = 150;
const SOUND_COOLDOWN_MS = 700;

let audioCtx: AudioContext | null = null;
let audioPrimed = false;
let pendingSound = false;
let pendingChatSound = false;
let soundDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSoundAt = 0;

function runTone(
  ctx: AudioContext,
  t0: number,
  freqStart: number,
  freqEnd: number,
  duration: number,
  volume: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration * 0.35);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function runNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    runTone(ctx, ctx.currentTime, 740, 988, 0.35, 0.07);
    lastSoundAt = Date.now();
  } catch {
    /* ignore */
  }
}

/** Lower double-chime for chat messages — distinct from task notifications. */
function runChatNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    runTone(ctx, t0, 420, 520, 0.22, 0.09);
    runTone(ctx, t0 + 0.14, 520, 640, 0.22, 0.08);
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
  if (pendingChatSound) {
    pendingChatSound = false;
    runChatNotificationSound();
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

export function scheduleChatNotificationSound() {
  if (!audioPrimed) {
    pendingChatSound = true;
    return;
  }
  if (soundDebounceTimer) clearTimeout(soundDebounceTimer);
  soundDebounceTimer = setTimeout(() => {
    soundDebounceTimer = null;
    if (Date.now() - lastSoundAt < SOUND_COOLDOWN_MS) return;
    runChatNotificationSound();
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
  pendingChatSound = false;
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
