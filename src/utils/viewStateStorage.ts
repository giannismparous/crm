const STORAGE_PREFIX = "crm-view:";

function storageKey(tab: string) {
  return STORAGE_PREFIX + tab;
}

/** Load persisted list/filter state for a main tab (survives refresh). */
export function loadViewState<T extends Record<string, unknown>>(tab: string, defaults: T): T {
  try {
    const raw = sessionStorage.getItem(storageKey(tab));
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<T>;
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function saveViewState(tab: string, state: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(storageKey(tab), JSON.stringify(state));
  } catch {
    /* private browsing / quota */
  }
}
