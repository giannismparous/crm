import { useEffect, useRef } from "react";
import {
  clearFormDraft,
  isShallowDraftEmpty,
  saveFormDraft,
  type FormDraftEnvelope,
} from "../utils/formDraftStorage";

type Options<T> = {
  isEmpty?: (data: T) => boolean;
};

/** Persist in-progress form fields (survives refresh and tab switches). */
export function usePersistedFormDraft<T extends Record<string, unknown>>(
  key: string,
  envelope: FormDraftEnvelope<T>,
  options: Options<T> = {}
): void {
  const isEmpty = options.isEmpty ?? ((data) => isShallowDraftEmpty(data as Record<string, unknown>));
  const serialized = JSON.stringify(envelope);
  const skipFirst = useRef(true);

  useEffect(() => {
    if (!key.trim()) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      const empty = isEmpty(envelope.data);
      if (!envelope.open && !envelope.editing && empty) {
        clearFormDraft(key);
        return;
      }
      saveFormDraft(key, envelope);
    }, 150);
    return () => window.clearTimeout(id);
  }, [key, serialized, envelope, isEmpty]);
}
