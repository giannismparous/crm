import type { calendar_v3 } from "googleapis";
import { CRM_SOURCE, ORG_TIMEZONE } from "./constants";
import type { CrmAppointment, CrmPersonalReminder, CrmTask } from "./crmData";
import { crmAppUrl } from "./config";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function appLink(path: string): string {
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

export function buildTaskEvent(task: CrmTask): calendar_v3.Schema$Event | null {
  const dueDate = task.dueDate?.trim().slice(0, 10);
  if (!dueDate) return null;

  const lines = [
    task.description?.trim() ? stripHtml(task.description) : "",
    `Priority: ${task.priority ?? "medium"}`,
    `Status: ${task.status}`,
    `Open in CRM: ${appLink(`/?tab=tasks&task=${task.id}`)}`,
  ].filter(Boolean);

  return {
    summary: `[CRM Task] ${task.title.trim() || "Untitled task"}`,
    description: lines.join("\n\n"),
    start: { date: dueDate },
    end: { date: addDay(dueDate) },
    extendedProperties: {
      private: {
        crmSource: CRM_SOURCE,
        crmType: "task",
        crmId: task.id,
      },
    },
  };
}

export function buildAppointmentEvent(apt: CrmAppointment): calendar_v3.Schema$Event | null {
  const startsAt = apt.startsAt?.trim();
  if (!startsAt) return null;
  const endsAt = apt.endsAt?.trim() || defaultEndIso(startsAt, 60);

  const lines = [
    apt.description?.trim() ? stripHtml(apt.description) : "",
    apt.meetingLink?.trim() ? `Meeting link: ${apt.meetingLink.trim()}` : "",
    `Open in CRM: ${appLink(`/?tab=appointments&appointment=${apt.id}`)}`,
  ].filter(Boolean);

  return {
    summary: apt.title.trim() || "CRM Appointment",
    description: lines.join("\n\n"),
    location: apt.location?.trim() || undefined,
    start: { dateTime: startsAt, timeZone: ORG_TIMEZONE },
    end: { dateTime: endsAt, timeZone: ORG_TIMEZONE },
    extendedProperties: {
      private: {
        crmSource: CRM_SOURCE,
        crmType: "appointment",
        crmId: apt.id,
      },
    },
  };
}

export function buildReminderEvent(rem: CrmPersonalReminder): calendar_v3.Schema$Event | null {
  const dueAt = rem.dueAt?.trim();
  if (!dueAt) return null;
  const endsAt = defaultEndIso(dueAt, 30);

  const lines = [
    rem.notes?.trim() || "",
    `Open in CRM: ${appLink(`/?tab=reminders&reminder=${rem.id}`)}`,
  ].filter(Boolean);

  return {
    summary: `[CRM Reminder] ${rem.title.trim() || "Reminder"}`,
    description: lines.join("\n\n"),
    start: { dateTime: dueAt, timeZone: ORG_TIMEZONE },
    end: { dateTime: endsAt, timeZone: ORG_TIMEZONE },
    extendedProperties: {
      private: {
        crmSource: CRM_SOURCE,
        crmType: "personalReminder",
        crmId: rem.id,
      },
    },
  };
}
