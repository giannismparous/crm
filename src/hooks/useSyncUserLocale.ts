import { useEffect } from "react";
import { useI18n } from "../contexts/I18nContext";
import { applyDocumentLocale, loadLocale } from "../i18n/localeStorage";

/** Reload saved locale when the signed-in user changes. */
export function useSyncUserLocale(userId?: string) {
  const { setLocale } = useI18n();

  useEffect(() => {
    const locale = loadLocale(userId);
    setLocale(locale);
    applyDocumentLocale(locale);
  }, [userId, setLocale]);
}
