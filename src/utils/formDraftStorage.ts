const STORAGE_PREFIX = "crm-draft:";

function storageKey(key: string) {
  return STORAGE_PREFIX + key;
}

export type FormDraftEnvelope<T> = {
  open?: boolean;
  editing?: boolean;
  editId?: string;
  data: T;
};

export function readFormDraft<T>(key: string): FormDraftEnvelope<T> | null {
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormDraftEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || parsed.data == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveFormDraft<T>(key: string, envelope: FormDraftEnvelope<T>): void {
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(envelope));
  } catch {
    /* private browsing / quota */
  }
}

export function clearFormDraft(key: string): void {
  try {
    sessionStorage.removeItem(storageKey(key));
  } catch {
    /* ignore */
  }
}

/** True when every string field is blank and every array is empty. */
export function isShallowDraftEmpty(data: Record<string, unknown>): boolean {
  return Object.values(data).every((value) => {
    if (typeof value === "string") return !value.trim();
    if (Array.isArray(value)) return value.length === 0;
    if (value == null) return true;
    if (typeof value === "boolean" || typeof value === "number") return false;
    return false;
  });
}
