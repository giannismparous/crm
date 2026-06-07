import { doc, runTransaction, type Firestore } from "firebase/firestore";
import type { PersonalReminder, Person } from "../types";
import { recipientIdsFromSelection } from "./notifyRecipients";
import { upsertReminderDueNotifications } from "../firebase/notifications";

export const REMINDER_DUE_OFFSETS = [
  { key: "1d", ms: 24 * 60 * 60 * 1000, label: "1 day" },
  { key: "6h", ms: 6 * 60 * 60 * 1000, label: "6 hours" },
  { key: "2h", ms: 2 * 60 * 60 * 1000, label: "2 hours" },
  { key: "30m", ms: 30 * 60 * 1000, label: "30 minutes" },
] as const;

export function reminderDueNotificationId(reminderId: string, recipientId: string): string {
  return `${reminderId}_due_${recipientId}`;
}

export function recipientsForReminderDue(reminder: PersonalReminder, people: Person[]): string[] {
  const ids = new Set(
    recipientIdsFromSelection(people, reminder.participantIds, reminder.participantDepartmentIds, [])
  );
  if (reminder.ownerId) ids.add(reminder.ownerId);
  return [...ids];
}

/** Fire any due-alert slots whose time has passed; one inbox row per recipient (overwritten each slot). */
export async function tryFireReminderDueNotifications(
  db: Firestore,
  orgId: string,
  reminder: PersonalReminder,
  people: Person[]
): Promise<void> {
  if (reminder.done) return;
  const dueMs = new Date(reminder.dueAt).getTime();
  if (Number.isNaN(dueMs)) return;

  const now = Date.now();
  if (now >= dueMs) return;

  const slotsPastDue = REMINDER_DUE_OFFSETS.filter((o) => now >= dueMs - o.ms);
  if (slotsPastDue.length === 0) return;

  const reminderRef = doc(db, "organizations", orgId, "personalReminders", reminder.id);

  const slotsToFire = await runTransaction(db, async (tx) => {
    const snap = await tx.get(reminderRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (Boolean(data.done)) return null;

    const fired = new Set(
      Array.isArray(data.dueNotifyFired)
        ? (data.dueNotifyFired as unknown[]).map((x) => String(x).trim()).filter(Boolean)
        : []
    );

    const pending = slotsPastDue.filter((s) => !fired.has(s.key));
    if (pending.length === 0) return null;

    for (const s of pending) fired.add(s.key);
    tx.update(reminderRef, { dueNotifyFired: [...fired] });
    return [...pending].sort((a, b) => b.ms - a.ms);
  });

  if (!slotsToFire || slotsToFire.length === 0) return;

  const recipients = recipientsForReminderDue(reminder, people);
  if (recipients.length === 0) return;

  const title = reminder.title.trim() || "Reminder";
  for (const slot of slotsToFire) {
    await upsertReminderDueNotifications(
      db,
      orgId,
      reminder.id,
      title,
      recipients,
      slot.label,
      slot.key
    );
  }
}
