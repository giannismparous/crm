import { normalizeOrgRole, type OrgRole } from "../auth/roles";

export const SEED_VALID_DAYS_MIN = 1;
export const SEED_VALID_DAYS_MAX = 7;

export const PARTNER_ACCOUNT_MONTH_OPTIONS = [1, 3, 6, 12, 24, 36] as const;
export type PartnerAccountMonths = (typeof PARTNER_ACCOUNT_MONTH_OPTIONS)[number];

export const SEED_EXPIRED_MESSAGE = "Expired seed.";
export const ACCOUNT_EXPIRED_MESSAGE = "Your account has expired.";

export function clampSeedValidDays(days: number): number {
  const n = Math.round(days);
  return Math.min(SEED_VALID_DAYS_MAX, Math.max(SEED_VALID_DAYS_MIN, n));
}

export function normalizePartnerAccountMonths(value: unknown): PartnerAccountMonths {
  const n = Math.round(Number(value));
  if ((PARTNER_ACCOUNT_MONTH_OPTIONS as readonly number[]).includes(n)) {
    return n as PartnerAccountMonths;
  }
  return 12;
}

export function seedExpiresAtIso(issuedAt: string, validDays: number): string {
  const base = new Date(issuedAt);
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  const d = new Date(base);
  d.setDate(d.getDate() + clampSeedValidDays(validDays));
  return d.toISOString();
}

export function isSeedExpired(seed: { expiresAt?: string }, nowMs = Date.now()): boolean {
  if (!seed.expiresAt) return false;
  const t = new Date(seed.expiresAt).getTime();
  return !Number.isNaN(t) && nowMs > t;
}

export function accountExpiresAtFromMonths(registeredAt: string, months: number): string {
  const base = new Date(registeredAt);
  const d = Number.isNaN(base.getTime()) ? new Date() : new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export function isPartnerRole(role: unknown): boolean {
  const r = normalizeOrgRole(role);
  return r === "partner";
}

export function isAccountExpired(
  person: { accountExpiresAt?: string; orgRole?: OrgRole | string },
  nowMs = Date.now()
): boolean {
  if (!isPartnerRole(person.orgRole)) return false;
  const raw = String(person.accountExpiresAt ?? "").trim();
  if (!raw) return false;
  const t = new Date(raw).getTime();
  return !Number.isNaN(t) && nowMs > t;
}
