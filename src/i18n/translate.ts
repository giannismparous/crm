import { el } from "./messages/el/index";
import { en } from "./messages/en/index";
import type { AppLocale, TranslateVars } from "./types";

const MESSAGES: Record<AppLocale, Record<string, string>> = { el, en };

function resolveKey(dict: Record<string, string>, key: string, vars?: TranslateVars): string | undefined {
  if (vars?.count !== undefined) {
    const count = Number(vars.count);
    const pluralKey = count === 1 ? `${key}_one` : `${key}_other`;
    if (dict[pluralKey]) return dict[pluralKey];
  }
  return dict[key];
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = vars[name];
    return value === undefined ? "" : String(value);
  });
}

export function translate(locale: AppLocale, key: string, vars?: TranslateVars): string {
  const primary = MESSAGES[locale];
  const fallback = MESSAGES.en;
  const raw = resolveKey(primary, key, vars) ?? resolveKey(fallback, key, vars) ?? key;
  return interpolate(raw, vars);
}
