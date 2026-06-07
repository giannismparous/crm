import type { Person, Task, TaskFeedbackRequest, TaskFeedbackResponse } from "../types";
import { imageAttachmentsForFirestore, normalizeImageAttachments } from "./imageAttachments";
import { getTaskWorkerIds } from "./taskAssignees";
import { recipientIdsFromSelection } from "./notifyRecipients";
import { richTextHasContent } from "./richTextImages";
import { sanitizeTaskUpdates } from "./sanitizeRichText";

export function normalizeFeedbackRequests(value: unknown): TaskFeedbackRequest[] {
  if (!Array.isArray(value)) return [];
  const out: TaskFeedbackRequest[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const requestedById = String(o.requestedById ?? "").trim();
    if (!id || !requestedById) continue;
    const status = o.status === "resolved" ? "resolved" : "open";
    const responses: TaskFeedbackResponse[] = [];
    if (Array.isArray(o.responses)) {
      for (const r of o.responses) {
        if (!r || typeof r !== "object") continue;
        const row = r as Record<string, unknown>;
        const personId = String(row.personId ?? "").trim();
        const body = String(row.body ?? "").trim();
        const attachments = normalizeImageAttachments(row.attachments);
        if (!personId || (!richTextHasContent(body) && attachments.length === 0)) continue;
        responses.push({
          personId,
          body,
          createdAt: String(row.createdAt ?? new Date().toISOString()),
          ...(attachments.length > 0 ? { attachments } : {}),
        });
      }
    }
    out.push({
      id,
      requestedById,
      createdAt: String(o.createdAt ?? new Date().toISOString()),
      notifyPersonIds: Array.isArray(o.notifyPersonIds)
        ? [...new Set(o.notifyPersonIds.map((x) => String(x).trim()).filter(Boolean))]
        : [],
      notifyDepartmentIds: Array.isArray(o.notifyDepartmentIds)
        ? [...new Set(o.notifyDepartmentIds.map((x) => String(x).trim()).filter(Boolean))]
        : [],
      askedPersonIds: Array.isArray(o.askedPersonIds)
        ? [...new Set(o.askedPersonIds.map((x) => String(x).trim()).filter(Boolean))]
        : [],
      responses,
      status,
      ...(typeof o.resolvedAt === "string" && o.resolvedAt ? { resolvedAt: o.resolvedAt } : {}),
    });
  }
  return out;
}

/** Firestore rejects undefined field values — omit optional fields. */
export function feedbackRequestsForFirestore(requests: TaskFeedbackRequest[]): Record<string, unknown>[] {
  return requests.map((r) => {
    const row: Record<string, unknown> = {
      id: r.id,
      requestedById: r.requestedById,
      createdAt: r.createdAt,
      notifyPersonIds: r.notifyPersonIds,
      notifyDepartmentIds: r.notifyDepartmentIds,
      askedPersonIds: r.askedPersonIds,
      responses: r.responses.map((res) => {
        const item: Record<string, unknown> = {
          personId: res.personId,
          body: res.body,
          createdAt: res.createdAt,
        };
        if (res.attachments?.length) item.attachments = imageAttachmentsForFirestore(res.attachments);
        return item;
      }),
      status: r.status,
    };
    if (r.resolvedAt) row.resolvedAt = r.resolvedAt;
    return row;
  });
}

function requestsOf(task: Task): TaskFeedbackRequest[] {
  return task.feedbackRequests ?? [];
}

export function taskHasOpenFeedback(task: Task): boolean {
  return requestsOf(task).some((r) => r.status === "open");
}

export function personHasOpenFeedbackRequest(task: Task, personId: string): boolean {
  return requestsOf(task).some((r) => r.requestedById === personId && r.status === "open");
}

export function openFeedbackRequests(task: Task): TaskFeedbackRequest[] {
  return requestsOf(task).filter((r) => r.status === "open");
}

export function personWasAskedForFeedback(request: TaskFeedbackRequest, personId: string): boolean {
  return request.askedPersonIds.includes(personId);
}

export function personRespondedToFeedback(request: TaskFeedbackRequest, personId: string): boolean {
  return request.responses.some((r) => r.personId === personId);
}

export function canReplyToFeedbackRequest(
  request: TaskFeedbackRequest,
  personId: string
): boolean {
  return (
    request.status === "open" &&
    personWasAskedForFeedback(request, personId) &&
    !personRespondedToFeedback(request, personId)
  );
}

/** True if this person still owes a reply on an open feedback thread. */
export function personOwesOpenFeedbackReply(task: Task, personId: string): boolean {
  return openFeedbackRequests(task).some((r) => canReplyToFeedbackRequest(r, personId));
}

export function taskHasFeedbackHistory(task: Task): boolean {
  return requestsOf(task).length > 0;
}

export function allAskedHaveResponded(request: TaskFeedbackRequest): boolean {
  if (request.askedPersonIds.length === 0) return false;
  return request.askedPersonIds.every((id) => personRespondedToFeedback(request, id));
}

export function createFeedbackRequest(
  task: Task,
  people: Person[],
  requestedById: string,
  notifyPersonIds: string[],
  notifyDepartmentIds: string[]
): Pick<Task, "feedbackRequests" | "needsFeedback" | "feedbackByIds"> {
  const exclude = new Set<string>([requestedById, ...getTaskWorkerIds(task, people)]);
  if (task.assignedById) exclude.add(task.assignedById);
  const askedPersonIds = recipientIdsFromSelection(
    people,
    notifyPersonIds,
    notifyDepartmentIds,
    [...exclude]
  );
  const request: TaskFeedbackRequest = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    requestedById,
    createdAt: new Date().toISOString(),
    notifyPersonIds: [...new Set(notifyPersonIds)],
    notifyDepartmentIds: [...new Set(notifyDepartmentIds)],
    askedPersonIds,
    responses: [],
    status: "open",
  };
  const feedbackRequests = [...(task.feedbackRequests ?? []), request];
  return {
    feedbackRequests,
    needsFeedback: true,
    feedbackByIds: [...new Set([...(task.feedbackByIds ?? []), requestedById])],
  };
}

export function addFeedbackResponse(
  task: Task,
  requestId: string,
  personId: string,
  body: string
): Pick<Task, "feedbackRequests" | "needsFeedback" | "feedbackByIds"> {
  const safe = sanitizeTaskUpdates(body.trim());
  if (!richTextHasContent(safe)) {
    return {
      feedbackRequests: task.feedbackRequests ?? [],
      needsFeedback: task.needsFeedback,
      feedbackByIds: task.feedbackByIds ?? [],
    };
  }

  const feedbackRequests = (task.feedbackRequests ?? []).map((r) => {
    if (r.id !== requestId) return r;
    const responses: TaskFeedbackResponse[] = [
      ...r.responses,
      {
        personId,
        body: safe,
        createdAt: new Date().toISOString(),
      },
    ];
    const done = r.askedPersonIds.every((id) => responses.some((res) => res.personId === id));
    if (done) {
      return { ...r, responses, status: "resolved" as const, resolvedAt: new Date().toISOString() };
    }
    const { resolvedAt: _drop, ...open } = r;
    return { ...open, responses, status: r.status };
  });

  const needsFeedback = feedbackRequests.some((r) => r.status === "open");
  const feedbackByIds = needsFeedback
    ? [...new Set(feedbackRequests.filter((r) => r.status === "open").map((r) => r.requestedById))]
    : [];

  return { feedbackRequests, needsFeedback, feedbackByIds };
}

export function removeFeedbackResponseAttachment(
  task: Task,
  requestId: string,
  personId: string,
  storagePath: string
): Pick<Task, "feedbackRequests" | "needsFeedback" | "feedbackByIds"> | null {
  const path = storagePath.trim();
  if (!path) return null;

  let changed = false;
  const feedbackRequests = (task.feedbackRequests ?? []).map((r) => {
    if (r.id !== requestId) return r;
    const responses = r.responses.map((res) => {
      if (res.personId !== personId) return res;
      const attachments = (res.attachments ?? []).filter((a) => a.storagePath !== path);
      if (attachments.length === (res.attachments ?? []).length) return res;
      changed = true;
      if (!res.body.trim() && attachments.length === 0) return res;
      const row: TaskFeedbackResponse = {
        personId: res.personId,
        body: res.body,
        createdAt: res.createdAt,
      };
      if (attachments.length > 0) row.attachments = attachments;
      return row;
    });
    return { ...r, responses };
  });

  if (!changed) return null;
  const needsFeedback = feedbackRequests.some((r) => r.status === "open");
  const feedbackByIds = needsFeedback
    ? [...new Set(feedbackRequests.filter((r) => r.status === "open").map((r) => r.requestedById))]
    : [];
  return { feedbackRequests, needsFeedback, feedbackByIds };
}

export function askedPersonNames(request: TaskFeedbackRequest, people: Person[]): string {
  return request.askedPersonIds
    .map((id) => people.find((p) => p.id === id)?.name ?? "Unknown")
    .join(", ");
}
