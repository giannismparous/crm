import type { TabId } from "../types";
import { parseCrmDeepLink } from "./crmDeepLink";

const TAB_IDS: TabId[] = [
  "tasks",
  "projects",
  "appointments",
  "team",
  "contacts",
  "reminders",
  "research",
  "calendar",
];

export function readTabFromLocation(search = window.location.search): TabId {
  const tab = parseCrmDeepLink(search).tab;
  return tab && TAB_IDS.includes(tab) ? tab : "tasks";
}

/** Keep the active navbar tab in the URL so refresh returns to the same section. */
export function writeTabToLocation(tab: TabId, options?: { clearFocus?: boolean }) {
  const params = new URLSearchParams(window.location.search);
  params.set("tab", tab);
  if (options?.clearFocus) {
    params.delete("task");
    params.delete("appointment");
    params.delete("reminder");
    params.delete("contact");
  }
  const next = params.toString();
  const path = window.location.pathname + (next ? `?${next}` : "");
  window.history.replaceState({}, "", path);
}

/** Remove one-time deep-link item params; keep `tab` (and other unrelated params). */
export function stripCrmItemParams(params: URLSearchParams) {
  params.delete("task");
  params.delete("appointment");
  params.delete("reminder");
  params.delete("contact");
}
