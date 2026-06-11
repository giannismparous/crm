import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createT, type TFunction } from "../i18n/helpers";
import { applyDocumentLocale, loadLocale, saveLocale } from "../i18n/localeStorage";
import { APP_LOCALES, DEFAULT_LOCALE, LOCALE_LABELS, type AppLocale, type TranslateVars } from "../i18n/types";

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: TFunction;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  userId,
  children,
}: {
  userId?: string;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(() => loadLocale(userId));

  useEffect(() => {
    const loaded = loadLocale(userId);
    setLocaleState(loaded);
    applyDocumentLocale(loaded);
  }, [userId]);

  const setLocale = useCallback(
    (next: AppLocale) => {
      setLocaleState(next);
      saveLocale(userId, next);
      applyDocumentLocale(next);
    },
    [userId]
  );

  const t = useMemo(() => createT(locale), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Guest provider for auth screen before sign-in. */
export function GuestI18nProvider({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}

export { APP_LOCALES, DEFAULT_LOCALE, LOCALE_LABELS, type AppLocale, type TranslateVars };
