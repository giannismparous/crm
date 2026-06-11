import type { OrgRole } from "../auth/roles";
import type { TranslateVars } from "./types";
import { translate } from "./translate";
import type { AppLocale } from "./types";

const DEPT_KEYS: Record<string, string> = {
  Sales: "departments.sales",
  Marketing: "departments.marketing",
  Product: "departments.product",
  Engineering: "departments.engineering",
  Operations: "departments.operations",
  Finance: "departments.finance",
  Legal: "departments.legal",
  General: "departments.general",
};

export function translateDepartment(locale: AppLocale, dept: string): string {
  const key = DEPT_KEYS[dept];
  return key ? translate(locale, key) : dept;
}

export function translateRole(locale: AppLocale, role: OrgRole): string {
  return translate(locale, role === "founder" ? "roles.founder" : "roles.partner");
}

export function translateRoleSummary(locale: AppLocale, role: OrgRole): string {
  return translate(locale, role === "founder" ? "roles.founderSummary" : "roles.partnerSummary");
}

export function translatePriority(locale: AppLocale, priority: string): string {
  const key = `tasks.priority.${priority.toLowerCase()}`;
  const out = translate(locale, key);
  return out === key ? priority : out;
}

export function translateTaskStatus(locale: AppLocale, status: string): string {
  const normalized = status === "in_progress" ? "doing" : status;
  const key = `tasks.status.${normalized}`;
  const out = translate(locale, key);
  return out === key ? status : out;
}

export function translateContactStage(locale: AppLocale, stage: string): string {
  const key = `contacts.stage.${stage}`;
  const out = translate(locale, key);
  return out === key ? stage : out;
}

export type TFunction = (key: string, vars?: TranslateVars) => string;

export function createT(locale: AppLocale): TFunction {
  return (key, vars) => translate(locale, key, vars);
}
