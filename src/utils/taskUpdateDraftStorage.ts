export type TaskUpdateDraftState = {
  body: string;
  composing: boolean;
  composeId: string;
  updatedAt: string;
};

function storageKey(taskId: string, userId: string): string {
  return `crm-task-update-draft:${userId.trim()}:${taskId.trim()}`;
}

export function readTaskUpdateDraft(taskId: string, userId: string): TaskUpdateDraftState | null {
  if (!taskId.trim() || !userId.trim()) return null;
  try {
    const raw = localStorage.getItem(storageKey(taskId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TaskUpdateDraftState>;
    if (typeof parsed.body !== "string") return null;
    if (typeof parsed.composeId !== "string" || !parsed.composeId.trim()) return null;
    return {
      body: parsed.body,
      composing: Boolean(parsed.composing),
      composeId: parsed.composeId.trim(),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeTaskUpdateDraft(taskId: string, userId: string, state: TaskUpdateDraftState): void {
  if (!taskId.trim() || !userId.trim()) return;
  try {
    localStorage.setItem(storageKey(taskId, userId), JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function clearTaskUpdateDraft(taskId: string, userId: string): void {
  if (!taskId.trim() || !userId.trim()) return;
  try {
    localStorage.removeItem(storageKey(taskId, userId));
  } catch {
    /* ignore */
  }
}
