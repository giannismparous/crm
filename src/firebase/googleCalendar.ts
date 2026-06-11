import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp } from "./config";
import { reportActionWarning } from "../utils/actionFeedback";

export type GoogleCalendarCrmType = "task" | "appointment" | "personalReminder";
export type GoogleCalendarAction = "upsert" | "delete";

export interface GoogleCalendarStatus {
  connected: boolean;
  googleEmail: string | null;
  syncTasks: boolean;
  syncAppointments: boolean;
  syncReminders: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

function functions() {
  return getFunctions(getFirebaseApp(), "us-central1");
}

export async function fetchGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const fn = httpsCallable<void, GoogleCalendarStatus>(functions(), "getGoogleCalendarStatus");
  const result = await fn();
  return result.data;
}

export async function startGoogleCalendarConnect(): Promise<string> {
  const fn = httpsCallable<void, { authUrl: string }>(functions(), "startGoogleCalendarConnect");
  const result = await fn();
  return result.data.authUrl;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const fn = httpsCallable(functions(), "disconnectGoogleCalendar");
  await fn();
}

export async function updateGoogleCalendarSyncOptions(options: {
  syncTasks: boolean;
  syncAppointments: boolean;
  syncReminders: boolean;
}): Promise<GoogleCalendarStatus> {
  const fn = httpsCallable<typeof options, GoogleCalendarStatus>(
    functions(),
    "updateGoogleCalendarSyncOptions"
  );
  const result = await fn(options);
  return result.data;
}

export async function syncGoogleCalendarNow(): Promise<number> {
  const fn = httpsCallable<void, { ok: boolean; synced: number }>(
    functions(),
    "syncGoogleCalendarForUser"
  );
  const result = await fn();
  return result.data.synced;
}

function isIgnorableCalendarSyncError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code ?? "") : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (code === "functions/unauthenticated" || code === "functions/permission-denied") return true;
  if (/unauthenticated/i.test(msg)) return true;
  if (/not connected|calendar.*not.*linked/i.test(msg)) return true;
  return false;
}

export async function syncCrmItemToGoogleCalendar(
  crmType: GoogleCalendarCrmType,
  crmId: string,
  action: GoogleCalendarAction = "upsert"
): Promise<void> {
  try {
    const fn = httpsCallable<
      { crmType: GoogleCalendarCrmType; crmId: string; action: GoogleCalendarAction },
      { ok: boolean; message?: string }
    >(functions(), "syncGoogleCalendarItem");
    const result = await fn({ crmType, crmId, action });
    if (result.data.ok === false) {
      const message = result.data.message ?? "Google Calendar sync had an issue.";
      if (!/not connected|calendar.*not.*linked/i.test(message)) {
        reportActionWarning(message);
      }
    }
  } catch (err) {
    if (isIgnorableCalendarSyncError(err)) return;
    const msg = err instanceof Error ? err.message : "Google Calendar sync failed.";
    reportActionWarning(msg);
  }
}
