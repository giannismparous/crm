import type { Appointment, ContactReminder, PersonalReminder, ResearchItem, SalesContact, Task } from "../types";
import { storagePathsInUpdatesHtml } from "./richTextImages";

function addAttachmentPaths(paths: Set<string>, attachments?: { storagePath: string }[]): void {
  for (const a of attachments ?? []) {
    const p = a.storagePath?.trim();
    if (p) paths.add(p);
  }
}

function addHtmlPaths(paths: Set<string>, html: string | undefined): void {
  for (const p of storagePathsInUpdatesHtml(html ?? "")) paths.add(p);
}

export function storagePathsFromContactReminder(reminder: ContactReminder): string[] {
  const paths = new Set<string>();
  addHtmlPaths(paths, reminder.notes);
  addAttachmentPaths(paths, reminder.attachments);
  return [...paths];
}

export function storagePathsFromContact(contact: SalesContact): string[] {
  const paths = new Set<string>();
  addHtmlPaths(paths, contact.generalNotes);
  for (const r of contact.reminders ?? []) {
    for (const p of storagePathsFromContactReminder(r)) paths.add(p);
  }
  return [...paths];
}

export function storagePathsFromPersonalReminder(reminder: PersonalReminder): string[] {
  const paths = new Set<string>();
  addHtmlPaths(paths, reminder.notes);
  addAttachmentPaths(paths, reminder.attachments);
  return [...paths];
}

export function storagePathsFromAppointment(appointment: Appointment): string[] {
  const paths = new Set<string>();
  addHtmlPaths(paths, appointment.description);
  addAttachmentPaths(paths, appointment.attachments);
  return [...paths];
}

export function storagePathsFromResearchItem(item: ResearchItem): string[] {
  const paths = new Set<string>();
  addHtmlPaths(paths, item.notes);
  addAttachmentPaths(paths, item.attachments);
  return [...paths];
}

export function storagePathsFromTask(task: Task): string[] {
  const paths = new Set<string>();
  addHtmlPaths(paths, task.description);
  addHtmlPaths(paths, task.updates);
  for (const entry of task.updateEntries ?? []) {
    addHtmlPaths(paths, entry.body);
  }
  for (const comment of task.comments ?? []) {
    addHtmlPaths(paths, comment.body);
    addAttachmentPaths(paths, comment.attachments);
  }
  for (const request of task.feedbackRequests ?? []) {
    for (const response of request.responses ?? []) {
      addHtmlPaths(paths, response.body);
      addAttachmentPaths(paths, response.attachments);
    }
  }
  return [...paths];
}
