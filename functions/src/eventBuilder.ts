import type { calendar_v3 } from "googleapis";
import { CRM_SOURCE, ORG_TIMEZONE } from "./constants";
import type { CrmAppointment, CrmPersonalReminder, CrmTask } from "./crmData";
import { crmAppUrl } from "./config";
import {
  googleRecurrenceLines,
  isRecurringCrmAppointment,
  lastPastOccurrenceEndBefore,
  normalizeRecurrenceCount,
  normalizeRecurrenceRule,
} from "./recurrenceRrule";
import {
  departmentLabel,
  personNames,
  type CalendarBuildContext,
  type CalendarRelatedData,
} from "./calendarContext";

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

function calendarSummary(baseSummary: string, canceled: boolean): string {
  const stripped = baseSummary.replace(/^CANCELED\s*-\s*/i, "");
  if (canceled) return `CANCELED - ${stripped}`;
  return stripped;
}

function section(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  return `${title}:\n${trimmed}`;
}

function bulletLines(items: string[]): string {
  return items.map((item) => `• ${item}`).join("\n");
}

function linkEntry(label: string, url: string): string {
  return `→ ${label}: ${url}`;
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s)]+/g;

function urlsInText(text: string): string[] {
  return [...text.matchAll(URL_IN_TEXT_RE)].map((m) => m[0]);
}

/** Drop link rows whose URL already appears in detail sections or earlier link rows. */
function uniqueLinkEntries(sections: string[], entries: Array<{ label: string; url: string }>): string[] {
  const seen = new Set<string>();
  for (const section of sections) {
    for (const url of urlsInText(section)) seen.add(url);
  }
  const out: string[] = [];
  for (const { label, url } of entries) {
    const key = url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(linkEntry(label, key));
  }
  return out;
}

function buildDescription(primaryLink: string, sections: string[], links: string[]): string {
  const body = sections.filter(Boolean);
  const linkBlock = links.length > 0 ? ["", "Links:", ...links] : [];
  const urlsInBody = new Set<string>();
  for (const section of body) {
    for (const url of urlsInText(section)) urlsInBody.add(url);
  }
  const urlsInLinks = new Set(links.flatMap((l) => urlsInText(l)));
  if (!urlsInLinks.has(primaryLink) && !urlsInBody.has(primaryLink)) {
    linkBlock.push(linkEntry("Open in SimasiaAI CRM", primaryLink));
  }
  return [...body, ...linkBlock, "", DIVIDER, "", READ_ONLY_FOOTER].join("\n");
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

export function buildTaskEvent(
  task: CrmTask & { appointmentId?: string },
  ctx: CalendarBuildContext,
  related: CalendarRelatedData
): calendar_v3.Schema$Event | null {
  const dueDate = task.dueDate?.trim().slice(0, 10);
  if (!dueDate) return null;

  const title = task.title.trim() || "Untitled task";
  const link = deepLink(`/?tab=tasks&task=${task.id}`);
  const canceled = task.status === "canceled";
  const details = task.description?.trim() ? stripHtml(task.description) : "";
  const assignees = personNames(task.assigneeIds, ctx);
  const assigneeDepts = departmentLabel(task.assigneeDepartmentIds);
  const assignedBy = task.assignedById ? ctx.people.get(task.assignedById)?.name : undefined;
  const project = task.projectId ? ctx.projects.get(task.projectId) : undefined;

  const sections: string[] = [
    "Type: Task",
    `Status: ${formatLabel(task.status)}`,
    `Priority: ${formatLabel(task.priority ?? "medium")}`,
    assignedBy ? section("Assigned by", assignedBy) : "",
    assignees ? section("Assignees", assignees) : "",
    assigneeDepts ? section("Assigned departments", assigneeDepts) : "",
    project ? section("Project", project.name) : "",
  ];

  if (related.linkedAppointment) {
    const apt = related.linkedAppointment;
    sections.push(
      section(
        "Linked appointment",
        `${apt.title.trim() || "Meeting"}\n${deepLink(`/?tab=appointments&appointment=${apt.id}`)}`
      )
    );
  }

  if (details) sections.push(section("Description", details));

  const links = uniqueLinkEntries(sections, [
    { label: "This task", url: link },
    ...(project ? [{ label: "Projects tab", url: deepLink(`/?tab=projects`) }] : []),
  ]);

  return {
    summary: calendarSummary(`Task · ${title}`, canceled),
    description: buildDescription(link, sections, links),
    location: "SimasiaAI CRM",
    start: { date: dueDate },
    end: { date: addDay(dueDate) },
    colorId: canceled ? "11" : "9",
    ...readOnlyEventFields(link),
    ...eventMeta("task", task.id),
  };
}

export function buildAppointmentEvent(
  apt: CrmAppointment & { taskId?: string },
  ctx: CalendarBuildContext,
  related: CalendarRelatedData
): calendar_v3.Schema$Event | null {
  const startsAt = apt.startsAt?.trim();
  if (!startsAt) return null;
  const endsAt = apt.endsAt?.trim() || defaultEndIso(startsAt, 60);

  const title = apt.title.trim() || "Meeting";
  const link = deepLink(`/?tab=appointments&appointment=${apt.id}`);
  const canceled = apt.status === "canceled";
  const details = apt.description?.trim() ? stripHtml(apt.description) : "";
  const participants = personNames(apt.participantIds, ctx);
  const inviteDepts = departmentLabel(apt.participantDepartmentIds);
  const creator = apt.createdById ? ctx.people.get(apt.createdById)?.name : undefined;
  const review = [...new Set((apt.reviewItems ?? []).map((x) => x.trim()).filter(Boolean))];

  const sections: string[] = [
    "Type: Meeting / Appointment",
    creator ? section("Created by", creator) : "",
    participants ? section("Participants", participants) : "",
    inviteDepts ? section("Invited departments", inviteDepts) : "",
    apt.location?.trim() ? section("Location", apt.location.trim()) : "",
    apt.meetingLink?.trim() ? section("Meeting link", apt.meetingLink.trim()) : "",
  ];

  if (review.length > 0) {
    sections.push(section("What to review", bulletLines(review)));
  }

  if (related.linkedTasks.length > 0) {
    const taskLines = related.linkedTasks.map((t) => {
      const name = t.title.trim() || "Untitled task";
      const taskLink = deepLink(`/?tab=tasks&task=${t.id}`);
      const status = t.status !== "todo" ? ` (${formatLabel(t.status)})` : "";
      return `${name}${status}\n${taskLink}`;
    });
    sections.push(section("Linked tasks", taskLines.join("\n\n")));
  }

  if (details) sections.push(section("Description", details));

  const links = uniqueLinkEntries(sections, [{ label: "This appointment", url: link }]);

  const rule = normalizeRecurrenceRule(apt.recurrenceRule);
  const recurrenceCount = normalizeRecurrenceCount(apt.recurrenceCount);
  const recurring = isRecurringCrmAppointment(apt);
  let recurrence: string[] | undefined;
  if (recurring && rule) {
    const untilIso = apt.recurrenceCanceledFrom
      ? lastPastOccurrenceEndBefore(apt, apt.recurrenceCanceledFrom)
      : undefined;
    if (apt.recurrenceCanceledFrom && !untilIso) {
      return null;
    }
    recurrence = googleRecurrenceLines(rule, recurrenceCount, untilIso);
  }

  return {
    summary: calendarSummary(`Meeting · ${title}`, canceled && !recurring),
    description: buildDescription(link, sections, links),
    location: apt.location?.trim() || apt.meetingLink?.trim() || "SimasiaAI CRM",
    start: { dateTime: startsAt, timeZone: ORG_TIMEZONE },
    end: { dateTime: endsAt, timeZone: ORG_TIMEZONE },
    colorId: canceled && !recurring ? "11" : "10",
    ...(recurrence ? { recurrence } : {}),
    ...readOnlyEventFields(link),
    ...eventMeta("appointment", apt.id),
  };
}

export function buildReminderEvent(
  rem: CrmPersonalReminder & { taskId?: string; appointmentId?: string; contactId?: string },
  ctx: CalendarBuildContext,
  related: CalendarRelatedData
): calendar_v3.Schema$Event | null {
  const dueAt = rem.dueAt?.trim();
  if (!dueAt) return null;
  const endsAt = defaultEndIso(dueAt, 30);

  const title = rem.title.trim() || "Reminder";
  const link = deepLink(`/?tab=reminders&reminder=${rem.id}`);
  const notes = rem.notes?.trim() || "";
  const owner = rem.ownerId ? ctx.people.get(rem.ownerId)?.name : undefined;
  const shared = personNames(rem.participantIds, ctx);
  const sharedDepts = departmentLabel(rem.participantDepartmentIds);

  const contact = related.linkedContact ?? (rem.contactId ? ctx.contacts.get(rem.contactId.trim()) : undefined);

  const sections: string[] = [
    "Type: Personal reminder",
    owner ? section("Owner", owner) : "",
    shared ? section("Shared with", shared) : "",
    sharedDepts ? section("Shared departments", sharedDepts) : "",
  ];

  if (contact) {
    const contactLink = deepLink(`/?tab=contacts&contact=${contact.id}`);
    sections.push(section("Linked contact", `${contact.label}\n${contactLink}`));
  }

  if (related.linkedTask) {
    sections.push(
      section(
        "Linked task",
        `${related.linkedTask.title.trim() || "Task"}\n${deepLink(`/?tab=tasks&task=${related.linkedTask.id}`)}`
      )
    );
  }

  if (related.linkedAppointment) {
    sections.push(
      section(
        "Linked appointment",
        `${related.linkedAppointment.title.trim() || "Meeting"}\n${deepLink(`/?tab=appointments&appointment=${related.linkedAppointment.id}`)}`
      )
    );
  }

  if (notes) sections.push(section("Notes", notes));

  const links = uniqueLinkEntries(sections, [{ label: "This reminder", url: link }]);

  return {
    summary: `Reminder · ${title}`,
    description: buildDescription(link, sections, links),
    location: "SimasiaAI CRM",
    start: { dateTime: dueAt, timeZone: ORG_TIMEZONE },
    end: { dateTime: endsAt, timeZone: ORG_TIMEZONE },
    colorId: "5",
    ...readOnlyEventFields(link),
    ...eventMeta("personalReminder", rem.id),
  };
}

export function buildCalendarEvent(
  crmType: "task" | "appointment" | "personalReminder",
  item: CrmTask | CrmAppointment | CrmPersonalReminder,
  ctx: CalendarBuildContext,
  related: CalendarRelatedData
): calendar_v3.Schema$Event | null {
  if (crmType === "task") return buildTaskEvent(item as CrmTask, ctx, related);
  if (crmType === "appointment") return buildAppointmentEvent(item as CrmAppointment, ctx, related);
  return buildReminderEvent(item as CrmPersonalReminder, ctx, related);
}
