export const APP_LOCALES = ["el", "en"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "el";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  el: "Ελληνικά",
  en: "English",
};

export type TranslateVars = Record<string, string | number | undefined>;
