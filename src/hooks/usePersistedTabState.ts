import { useEffect, useRef } from "react";
import { loadViewState, saveViewState } from "../utils/viewStateStorage";

/** Read once on mount — use in `useState(() => saved.field)` initializers. */
export function readPersistedTabState<T extends Record<string, unknown>>(tabKey: string, defaults: T): T {
  return loadViewState(tabKey, defaults);
}

/** Debounced write of tab view state (filters, sort, selection, etc.). */
export function usePersistedTabState<T extends Record<string, unknown>>(tabKey: string, state: T): void {
  const skipFirst = useRef(true);
  const serialized = JSON.stringify(state);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      saveViewState(tabKey, JSON.parse(serialized) as T);
    }, 120);
    return () => window.clearTimeout(id);
  }, [tabKey, serialized]);
}
