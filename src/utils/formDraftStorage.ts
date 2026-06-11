const STORAGE_PREFIX = "crm-draft:";

/** New id on every full page load; tab switches keep the same module instance. */
const APP_SESSION_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function storageKey(key: string) {
  return STORAGE_PREFIX + key;
}

export type FormDraftEnvelope<T> = {
  open?: boolean;
  editing?: boolean;
  editId?: string;
  data: T;
};

type StoredFormDraftEnvelope<T> = FormDraftEnvelope<T> & {
  appSessionId?: string;
};

function envelopeForCurrentSession<T>(parsed: StoredFormDraftEnvelope<T>): FormDraftEnvelope<T> {
  if (parsed.appSessionId === APP_SESSION_ID) {
    return {
      open: parsed.open,
      editing: parsed.editing,
      editId: parsed.editId,
      data: parsed.data,
    };
  }
  // Full refresh: keep typed draft fields, but never reopen forms/editors.
  return {
    data: parsed.data,
    open: false,
    editing: false,
  };
}

export function readFormDraft<T>(key: string): FormDraftEnvelope<T> | null {
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFormDraftEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || parsed.data == null) return null;
    return envelopeForCurrentSession(parsed);
  } catch {
    return null;
  }
}

export function saveFormDraft<T>(key: string, envelope: FormDraftEnvelope<T>): void {
  try {
    const stored: StoredFormDraftEnvelope<T> = {
      ...envelope,
      appSessionId: APP_SESSION_ID,
    };
    sessionStorage.setItem(storageKey(key), JSON.stringify(stored));
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
