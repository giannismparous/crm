export type ThemeMode = "bright" | "dark";

const APPEARANCE_PREFIX = "crm-appearance:";
const LAST_USER_KEY = "crm-appearance:last-user";
/** @deprecated migrated into per-user keys */
const LEGACY_THEME_KEY = "crm-theme";
/** @deprecated migrated into per-user keys */
const LEGACY_FONT_SCALE_KEY = "crm-font-scale";

export const FONT_SCALE_MIN = 1;
export const FONT_SCALE_MAX = 1.35;
export const FONT_SCALE_DEFAULT = 1;
export const FONT_SCALE_STEP = 0.05;

export type AppearanceSettings = {
  theme: ThemeMode;
  fontScale: number;
};

const DEFAULT_SETTINGS: AppearanceSettings = {
  theme: "bright",
  fontScale: FONT_SCALE_DEFAULT,
};

function clampFontScale(value: number): number {
  const stepped = Math.round(value / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, stepped));
}

function normalizeSettings(raw: Partial<AppearanceSettings> | null | undefined): AppearanceSettings {
  const theme: ThemeMode = raw?.theme === "dark" ? "dark" : "bright";
  const scaleRaw = Number(raw?.fontScale);
  const fontScale = Number.isFinite(scaleRaw) ? clampFontScale(scaleRaw) : FONT_SCALE_DEFAULT;
  return { theme, fontScale };
}

function storageKey(userId: string): string {
  return `${APPEARANCE_PREFIX}${userId.trim() || "guest"}`;
}

function readLegacyAppearance(): AppearanceSettings | null {
  if (typeof window === "undefined") return null;
  const themeRaw = localStorage.getItem(LEGACY_THEME_KEY);
  const scaleRaw = localStorage.getItem(LEGACY_FONT_SCALE_KEY);
  if (themeRaw == null && scaleRaw == null) return null;
  return normalizeSettings({
    theme: themeRaw === "dark" ? "dark" : "bright",
    fontScale: Number(scaleRaw),
  });
}

/** Load appearance for a signed-in user (or guest / last active user before auth resolves). */
export function loadAppearance(userId?: string): AppearanceSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  const uid = userId?.trim() || localStorage.getItem(LAST_USER_KEY) || "guest";
  const stored = localStorage.getItem(storageKey(uid));
  if (stored) {
    try {
      return normalizeSettings(JSON.parse(stored) as Partial<AppearanceSettings>);
    } catch {
      /* fall through */
    }
  }

  const legacy = readLegacyAppearance();
  if (legacy) return legacy;
  return DEFAULT_SETTINGS;
}

export function saveAppearance(userId: string | undefined, settings: AppearanceSettings): void {
  if (typeof window === "undefined") return;
  const uid = userId?.trim() || "guest";
  const normalized = normalizeSettings(settings);
  localStorage.setItem(storageKey(uid), JSON.stringify(normalized));
  localStorage.setItem(LAST_USER_KEY, uid);
  localStorage.removeItem(LEGACY_THEME_KEY);
  localStorage.removeItem(LEGACY_FONT_SCALE_KEY);
}

export function applyAppearance(settings: AppearanceSettings): void {
  const normalized = normalizeSettings(settings);
  const root = document.documentElement;
  root.dataset.theme = normalized.theme;
  root.style.setProperty("--app-font-scale", String(normalized.fontScale));
}

export function initAppearance(): AppearanceSettings {
  const settings = loadAppearance();
  applyAppearance(settings);
  return settings;
}
