type FeedbackListener = (message: string, kind: "error" | "warning") => void;

const listeners = new Set<FeedbackListener>();

export function reportActionError(message: string): void {
  const text = message.trim();
  if (!text) return;
  for (const listener of listeners) listener(text, "error");
}

export function reportActionWarning(message: string): void {
  const text = message.trim();
  if (!text) return;
  for (const listener of listeners) listener(text, "warning");
}

export function subscribeActionFeedback(listener: FeedbackListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
