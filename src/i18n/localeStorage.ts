import { DEFAULT_LOCALE, type AppLocale } from "./types";

const LOCALE_PREFIX = "crm-locale:";
const GUEST_KEY = "crm-locale:guest";

function storageKey(userId: string): string {
  return `${LOCALE_PREFIX}${userId.trim() || "guest"}`;
}

export function loadLocale(userId?: string): AppLocale {
  try {
    const key = userId ? storageKey(userId) : GUEST_KEY;
    const raw = localStorage.getItem(key) ?? localStorage.getItem(GUEST_KEY);
    if (raw === "en" || raw === "el") return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function saveLocale(userId: string | undefined, locale: AppLocale): void {
  try {
    localStorage.setItem(GUEST_KEY, locale);
    if (userId?.trim()) {
      localStorage.setItem(storageKey(userId), locale);
    }
  } catch {
    /* ignore */
  }
}

export function applyDocumentLocale(locale: AppLocale): void {
  document.documentElement.lang = locale === "el" ? "el" : "en";
}
