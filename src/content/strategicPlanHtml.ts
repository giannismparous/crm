import type { AppLocale } from "../i18n/types";
import { STRATEGIC_PLAN_HTML_EL } from "./strategicPlanHtml.el";
import { STRATEGIC_PLAN_HTML_EN } from "./strategicPlanHtml.en";

export function getStrategicPlanHtml(locale: AppLocale): string {
  return locale === "el" ? STRATEGIC_PLAN_HTML_EL : STRATEGIC_PLAN_HTML_EN;
}

/** Greek source document — used by the Word import script. */
export const STRATEGIC_PLAN_HTML = STRATEGIC_PLAN_HTML_EL;
