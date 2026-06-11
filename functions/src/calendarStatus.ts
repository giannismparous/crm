/** Heal legacy background rate-limit strings stored on integration docs. */
export function healLegacyRateLimitError(lastError: unknown): string {
  const lastErrorStr = String(lastError ?? "").trim();
  return /^rate limit exceeded$/i.test(lastErrorStr) ? "" : lastErrorStr;
}
