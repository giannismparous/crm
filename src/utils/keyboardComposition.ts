import type { CompositionEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

type KeyboardLike = {
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
  key?: string;
};

/** True while an IME/dead-key accent sequence is in progress. */
export function isKeyboardComposing(e: KeyboardLike): boolean {
  return Boolean(e.isComposing || e.nativeEvent?.isComposing);
}

export function isEnterWithoutComposing(e: ReactKeyboardEvent): boolean {
  return e.key === "Enter" && !isKeyboardComposing(e);
}

/** Prevent accidental form submit while composing accents (Enter during IME). */
export function compositionFormKeyDown(e: ReactKeyboardEvent<HTMLFormElement>): void {
  if (e.key === "Enter" && isKeyboardComposing(e)) {
    e.preventDefault();
  }
}

export type CompositionInputHandlers = {
  onCompositionStart: () => void;
  onCompositionEnd: (e: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
};

/** Skip global hotkeys while typing in fields or during IME composition. */
export function isTypingOrComposingTarget(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return true;
  }
  return el instanceof HTMLElement && el.isContentEditable;
}
