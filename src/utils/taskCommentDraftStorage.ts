export type TaskCommentDraftState = {
  body: string;
  updatedAt: string;
};

function storageKey(taskId: string, userId: string): string {
  return `crm-task-comment-draft:${userId.trim()}:${taskId.trim()}`;
}

export function readTaskCommentDraft(taskId: string, userId: string): TaskCommentDraftState | null {
  if (!taskId.trim() || !userId.trim()) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(taskId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TaskCommentDraftState>;
    if (typeof parsed.body !== "string" || !parsed.body.trim()) return null;
    return {
      body: parsed.body,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeTaskCommentDraft(taskId: string, userId: string, state: TaskCommentDraftState): void {
  if (!taskId.trim() || !userId.trim()) return;
  try {
    sessionStorage.setItem(storageKey(taskId, userId), JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function clearTaskCommentDraft(taskId: string, userId: string): void {
  if (!taskId.trim() || !userId.trim()) return;
  try {
    sessionStorage.removeItem(storageKey(taskId, userId));
  } catch {
    /* ignore */
  }
}
