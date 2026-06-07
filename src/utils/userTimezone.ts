/** Organization default — Athens (EET/EEST). */
export const ORG_TIMEZONE = "Europe/Athens";

export type TimezoneMode = "auto" | "org" | "custom";

export type TimezoneSettings = {
  mode: TimezoneMode;
  customTimeZone: string;
};

const STORAGE_PREFIX = "crm-timezone:";
const LAST_USER_KEY = "crm-timezone:last-user";

const DEFAULT_SETTINGS: TimezoneSettings = {
  mode: "org",
  customTimeZone: ORG_TIMEZONE,
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId.trim() || "guest"}`;
}

export function isValidTimezone(tz: string): boolean {
  const id = tz.trim();
  if (!id) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

/** Browser / OS timezone (e.g. America/Los_Angeles). */
export function getDetectedTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    return tz && isValidTimezone(tz) ? tz : ORG_TIMEZONE;
  } catch {
    return ORG_TIMEZONE;
  }
}

export function normalizeTimezoneSettings(
  raw: Partial<TimezoneSettings> | null | undefined
): TimezoneSettings {
  const mode: TimezoneMode =
    raw?.mode === "auto" || raw?.mode === "custom" ? raw.mode : "org";
  const customRaw = String(raw?.customTimeZone ?? "").trim();
  const customTimeZone =
    customRaw && isValidTimezone(customRaw) ? customRaw : getDetectedTimezone();
  return { mode, customTimeZone };
}

export function resolveEffectiveTimezone(settings: TimezoneSettings): string {
  const normalized = normalizeTimezoneSettings(settings);
  if (normalized.mode === "auto") return getDetectedTimezone();
  if (normalized.mode === "org") return ORG_TIMEZONE;
  return normalized.customTimeZone;
}

export function loadTimezoneSettings(userId?: string): TimezoneSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  const uid = userId?.trim() || localStorage.getItem(LAST_USER_KEY) || "guest";
  const stored = localStorage.getItem(storageKey(uid));
  if (!stored) return DEFAULT_SETTINGS;
  try {
    return normalizeTimezoneSettings(JSON.parse(stored) as Partial<TimezoneSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveTimezoneSettings(userId: string | undefined, settings: TimezoneSettings): void {
  if (typeof window === "undefined") return;
  const uid = userId?.trim() || "guest";
  const normalized = normalizeTimezoneSettings(settings);
  localStorage.setItem(storageKey(uid), JSON.stringify(normalized));
  localStorage.setItem(LAST_USER_KEY, uid);
}

let cachedTimezones: string[] | null = null;

const FALLBACK_TIMEZONES = [
  "Europe/Athens",
  "America/Los_Angeles",
  "America/New_York",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

export function listAllTimezones(): string[] {
  if (cachedTimezones) return cachedTimezones;
  try {
    const supportedValuesOf = (
      Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      cachedTimezones = supportedValuesOf("timeZone").slice().sort();
      return cachedTimezones;
    }
  } catch {
    /* fall through */
  }
  cachedTimezones = [...FALLBACK_TIMEZONES];
  return cachedTimezones;
}

export function formatTimezoneLabel(tz: string, when = new Date()): string {
  if (!isValidTimezone(tz)) return tz;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(when);
  const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const name = tz.replace(/_/g, " ");
  return offset ? `${name} (${offset})` : name;
}

export function formatTimezonePreview(tz: string, when = new Date()): string {
  if (!isValidTimezone(tz)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(when);
}
