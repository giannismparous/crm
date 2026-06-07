import type { calendar_v3 } from "googleapis";
import { CRM_SOURCE, ORG_TIMEZONE } from "./constants";
import type { CrmAppointment, CrmPersonalReminder, CrmTask } from "./crmData";
import { crmAppUrl } from "./config";

const DIVIDER = "────────────────────";
const READ_ONLY_FOOTER =
  "Read-only copy from SimasiaAI CRM. Edit or delete items in the CRM only — changes made here are overwritten on the next sync.";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function deepLink(path: string): string {
  const base = crmAppUrl.value().replace(/\/$/, "");
  return `${base}${path}`;
}

function addDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function defaultEndIso(startsAt: string, minutes = 60): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return new Date(Date.now() + minutes * 60_000).toISOString();
  return new Date(start.getTime() + minutes * 60_000).toISOString();
}

function buildDescription(lines: string[], link: string): string {
  const body = lines.filter(Boolean);
  return [...body, "", DIVIDER, "Open in SimasiaAI CRM:", link, "", READ_ONLY_FOOTER].join("\n");
}

function readOnlyEventFields(link: string): Pick<calendar_v3.Schema$Event, "source" | "guestsCanModify" | "guestsCanInviteOthers"> {
  return {
    source: { title: "SimasiaAI CRM", url: link },
    guestsCanModify: false,
    guestsCanInviteOthers: false,
  };
}

function eventMeta(crmType: string, crmId: string) {
  return {
    extendedProperties: {
      private: {
        crmSource: CRM_SOURCE,
        crmType,
        crmId,
      },
    },
  };
}

export function buildTaskEvent(task: CrmTask): calendar_v3.Schema$Event | null {
  const dueDate = task.dueDate?.trim().slice(0, 10);
  if (!dueDate) return null;

  const title = task.title.trim() || "Untitled task";
  const link = deepLink(`/?tab=tasks&task=${task.id}`);
  const details = task.description?.trim() ? stripHtml(task.description) : "";

  const lines = [
    `Type: Task`,
    `Priority: ${formatLabel(task.priority ?? "medium")}`,
    `Status: ${formatLabel(task.status)}`,
    details ? `\nDetails:\n${details}` : "",
  ];

  return {
    summary: `Task · ${title}`,
    description: buildDescription(lines, link),
    location: "SimasiaAI CRM",
    start: { date: dueDate },
    end: { date: addDay(dueDate) },
    colorId: "9",
    ...readOnlyEventFields(link),
    ...eventMeta("task", task.id),
  };
}

export function buildAppointmentEvent(apt: CrmAppointment): calendar_v3.Schema$Event | null {
  const startsAt = apt.startsAt?.trim();
  if (!startsAt) return null;
  const endsAt = apt.endsAt?.trim() || defaultEndIso(startsAt, 60);

  const title = apt.title.trim() || "Meeting";
  const link = deepLink(`/?tab=appointments&appointment=${apt.id}`);
  const details = apt.description?.trim() ? stripHtml(apt.description) : "";

  const lines = [
    `Type: Meeting / Appointment`,
    apt.location?.trim() ? `Location: ${apt.location.trim()}` : "",
    apt.meetingLink?.trim() ? `Join: ${apt.meetingLink.trim()}` : "",
    details ? `\nDetails:\n${details}` : "",
  ];

  return {
    summary: `Meeting · ${title}`,
    description: buildDescription(lines, link),
    location: apt.location?.trim() || apt.meetingLink?.trim() || "SimasiaAI CRM",
    start: { dateTime: startsAt, timeZone: ORG_TIMEZONE },
    end: { dateTime: endsAt, timeZone: ORG_TIMEZONE },
    colorId: "10",
    ...readOnlyEventFields(link),
    ...eventMeta("appointment", apt.id),
  };
}

export function buildReminderEvent(rem: CrmPersonalReminder): calendar_v3.Schema$Event | null {
  const dueAt = rem.dueAt?.trim();
  if (!dueAt) return null;
  const endsAt = defaultEndIso(dueAt, 30);

  const title = rem.title.trim() || "Reminder";
  const link = deepLink(`/?tab=reminders&reminder=${rem.id}`);
  const notes = rem.notes?.trim() || "";

  const lines = [`Type: Personal reminder`, notes ? `\nNotes:\n${notes}` : ""];

  return {
    summary: `Reminder · ${title}`,
    description: buildDescription(lines, link),
    location: "SimasiaAI CRM",
    start: { dateTime: dueAt, timeZone: ORG_TIMEZONE },
    end: { dateTime: endsAt, timeZone: ORG_TIMEZONE },
    colorId: "5",
    ...readOnlyEventFields(link),
    ...eventMeta("personalReminder", rem.id),
  };
}
