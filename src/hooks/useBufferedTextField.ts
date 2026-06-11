import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";

/**
 * Local draft for controlled text fields that sync to Firestore (or similar) on blur.
 * Avoids breaking Greek/dead-key accents when remote snapshots overwrite mid-composition.
 */
type BufferedTextFieldOptions = {
  /** Trim leading/trailing whitespace before commit (names, titles). */
  trim?: boolean;
};

export function useBufferedTextField(
  sourceValue: string,
  onCommit: (value: string) => void | Promise<void>,
  entityKey: string,
  options?: BufferedTextFieldOptions
) {
  const [draft, setDraft] = useState(sourceValue);
  const composingRef = useRef(false);
  const focusedRef = useRef(false);
  const draftRef = useRef(sourceValue);
  draftRef.current = draft;

  useEffect(() => {
    setDraft(sourceValue);
  }, [entityKey]);

  useEffect(() => {
    if (!focusedRef.current && !composingRef.current) {
      setDraft(sourceValue);
    }
  }, [sourceValue]);

  function commit() {
    const raw = draftRef.current;
    const next = options?.trim ? raw.trim() : raw;
    if (next !== sourceValue) void onCommit(next);
    if (options?.trim && next !== raw) setDraft(next);
  }

  return {
    value: draft,
    setDraft,
    commit,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value);
    },
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (e: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composingRef.current = false;
      setDraft(e.currentTarget.value);
    },
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: () => {
      focusedRef.current = false;
      if (!composingRef.current) commit();
    },
  };
}
