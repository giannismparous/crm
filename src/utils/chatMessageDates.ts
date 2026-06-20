import { loadLocale } from "../i18n/localeStorage";
import { intlLocaleForApp } from "../i18n/helpers";
import { translate } from "../i18n/translate";
import type { AppLocale } from "../i18n/types";
import {
  getActiveTimezone,
  orgDateKey,
  orgTodayDateKey,
  orgYmdAddDays,
} from "./orgTimezone";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function orgYesterdayDateKey(): string {
  const today = orgTodayDateKey();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) return today;
  const next = orgYmdAddDays(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    -1,
    getActiveTimezone()
  );
  return `${next.year}-${pad2(next.monthIndex + 1)}-${pad2(next.day)}`;
}

export function messageOrgDateKey(iso: string): string {
  return orgDateKey(iso);
}

/** Label for chat date divider — Today, Yesterday, or formatted calendar date. */
export function formatChatDateSeparatorLabel(
  dateKey: string,
  locale: AppLocale = loadLocale()
): string {
  if (!dateKey) return "";
  if (dateKey === orgTodayDateKey()) return translate(locale, "common.today");
  if (dateKey === orgYesterdayDateKey()) return translate(locale, "common.yesterday");

  const todayYear = orgTodayDateKey().slice(0, 4);
  const sameYear = dateKey.slice(0, 4) === todayYear;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return date.toLocaleDateString(intlLocaleForApp(locale), {
    timeZone: getActiveTimezone(),
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
