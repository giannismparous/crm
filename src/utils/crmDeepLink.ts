import type { TabId } from "../types";

export interface CrmDeepLink {
  tab?: TabId;
  taskId?: string;
  appointmentId?: string;
  reminderId?: string;
}

const TAB_IDS: TabId[] = [
  "tasks",
  "projects",
  "appointments",
  "team",
  "contacts",
  "reminders",
  "calendar",
];

/** Parse `?tab=tasks&task=…` style URLs from Google Calendar / shared links. */
export function parseCrmDeepLink(search: string): CrmDeepLink {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const tabRaw = params.get("tab")?.trim();
  const tab = TAB_IDS.includes(tabRaw as TabId) ? (tabRaw as TabId) : undefined;
  return {
    tab,
    taskId: params.get("task")?.trim() || undefined,
    appointmentId: params.get("appointment")?.trim() || undefined,
    reminderId: params.get("reminder")?.trim() || undefined,
  };
}

export function hasCrmDeepLink(link: CrmDeepLink): boolean {
  return Boolean(link.tab || link.taskId || link.appointmentId || link.reminderId);
}
