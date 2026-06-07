import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp } from "./config";

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

export async function syncCrmItemToGoogleCalendar(
  crmType: GoogleCalendarCrmType,
  crmId: string,
  action: GoogleCalendarAction = "upsert"
): Promise<void> {
  try {
    const fn = httpsCallable(functions(), "syncGoogleCalendarItem");
    await fn({ crmType, crmId, action });
  } catch (err) {
    console.warn("Google Calendar sync skipped:", err);
  }
}
