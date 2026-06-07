export const ORG_ID = "SimasiaAI";
export const ORG_TIMEZONE = "Europe/Athens";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CRM_SOURCE = "simasia-crm";

export type CrmType = "task" | "appointment" | "personalReminder";
export type SyncAction = "upsert" | "delete";

export interface GoogleCalendarIntegration {
  connected: boolean;
  googleEmail?: string;
  calendarId: string;
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  syncTasks: boolean;
  syncAppointments: boolean;
  syncReminders: boolean;
  connectedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
}

export interface EventMapDoc {
  crmType: CrmType;
  crmId: string;
  googleEventId: string;
  updatedAt: string;
}
