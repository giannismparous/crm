import type { Firestore } from "firebase-admin/firestore";
import type { calendar_v3 } from "googleapis";
import { ORG_ID, type CrmType, type SyncAction } from "./constants";
import { eventMapId, eventMapRef } from "./config";
import {
  loadCrmItem,
  relevantUserIds,
  shouldDeleteFromCalendar,
  userWantsSync,
  type CrmAppointment,
  type CrmPersonalReminder,
  type CrmTask,
} from "./crmData";
import {
  buildAppointmentEvent,
  buildReminderEvent,
  buildTaskEvent,
} from "./eventBuilder";
import { getAuthedCalendarClient, loadIntegration, saveIntegration } from "./tokens";

function buildEvent(
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder
): calendar_v3.Schema$Event | null {
  if (crmType === "task") return buildTaskEvent(item as CrmTask);
  if (crmType === "appointment") return buildAppointmentEvent(item as CrmAppointment);
  return buildReminderEvent(item as CrmPersonalReminder);
}

async function deleteMappedEvent(
  db: Firestore,
  uid: string,
  mapId: string,
  calendarId: string
): Promise<void> {
  const mapSnap = await eventMapRef(db, uid, mapId).get();
  if (!mapSnap.exists) return;

  const { googleEventId } = mapSnap.data() as { googleEventId: string };
  try {
    const calendar = await getAuthedCalendarClient(db, uid);
    await calendar.events.delete({ calendarId, eventId: googleEventId });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 404 && code !== 410) throw err;
  }
  await eventMapRef(db, uid, mapId).delete();
}

async function upsertMappedEvent(
  db: Firestore,
  uid: string,
  mapId: string,
  calendarId: string,
  event: calendar_v3.Schema$Event
): Promise<void> {
  const calendar = await getAuthedCalendarClient(db, uid);
  const mapSnap = await eventMapRef(db, uid, mapId).get();
  const now = new Date().toISOString();

  if (mapSnap.exists) {
    const { googleEventId } = mapSnap.data() as { googleEventId: string };
    await calendar.events.patch({
      calendarId,
      eventId: googleEventId,
      requestBody: event,
    });
    await eventMapRef(db, uid, mapId).set(
      {
        crmType: event.extendedProperties?.private?.crmType,
        crmId: event.extendedProperties?.private?.crmId,
        googleEventId,
        updatedAt: now,
      },
      { merge: true }
    );
    return;
  }

  const created = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });
  const googleEventId = created.data.id;
  if (!googleEventId) throw new Error("Google Calendar did not return an event id.");

  await eventMapRef(db, uid, mapId).set({
    crmType: event.extendedProperties?.private?.crmType,
    crmId: event.extendedProperties?.private?.crmId,
    googleEventId,
    updatedAt: now,
  });
}

export async function syncItemForUser(
  db: Firestore,
  uid: string,
  crmType: CrmType,
  crmId: string,
  action: SyncAction,
  item?: CrmTask | CrmAppointment | CrmPersonalReminder | null
): Promise<void> {
  const integration = await loadIntegration(db, uid);
  if (!integration?.connected) return;
  if (!userWantsSync(integration, crmType)) return;

  const mapId = eventMapId(crmType, crmId);
  const calendarId = integration.calendarId || "primary";

  if (action === "delete") {
    await deleteMappedEvent(db, uid, mapId, calendarId);
    return;
  }

  const loaded = item ?? (await loadCrmItem(db, crmType, crmId));
  if (!loaded) {
    await deleteMappedEvent(db, uid, mapId, calendarId);
    return;
  }

  if (!relevantUserIds(crmType, loaded).includes(uid)) {
    await deleteMappedEvent(db, uid, mapId, calendarId);
    return;
  }

  if (shouldDeleteFromCalendar(crmType, loaded)) {
    await deleteMappedEvent(db, uid, mapId, calendarId);
    return;
  }

  const event = buildEvent(crmType, loaded);
  if (!event) {
    await deleteMappedEvent(db, uid, mapId, calendarId);
    return;
  }

  await upsertMappedEvent(db, uid, mapId, calendarId, event);
}

export async function syncItemForAllUsers(
  db: Firestore,
  crmType: CrmType,
  crmId: string,
  action: SyncAction
): Promise<void> {
  if (action === "delete") {
    const maps = await db
      .collectionGroup("events")
      .where("crmType", "==", crmType)
      .where("crmId", "==", crmId)
      .get();
    await Promise.all(
      maps.docs.map(async (mapDoc) => {
        const uid = mapDoc.ref.parent.parent?.parent?.parent?.id;
        if (!uid) return;
        const integration = await loadIntegration(db, uid);
        if (!integration?.connected) return;
        const calendarId = integration.calendarId || "primary";
        const { googleEventId } = mapDoc.data() as { googleEventId: string };
        try {
          const calendar = await getAuthedCalendarClient(db, uid);
          await calendar.events.delete({ calendarId, eventId: googleEventId });
        } catch (err) {
          const code = (err as { code?: number })?.code;
          if (code !== 404 && code !== 410) throw err;
        }
        await mapDoc.ref.delete();
      })
    );
    return;
  }

  const item = await loadCrmItem(db, crmType, crmId);
  if (!item) return;

  const userIds = relevantUserIds(crmType, item);
  await Promise.all(
    userIds.map((uid) => syncItemForUser(db, uid, crmType, crmId, "upsert", item))
  );
}

export async function fullSyncForUser(db: Firestore, uid: string): Promise<number> {
  const integration = await loadIntegration(db, uid);
  if (!integration?.connected) throw new Error("Google Calendar is not connected.");

  let synced = 0;
  const collections: Array<{ crmType: CrmType; name: string }> = [];

  if (integration.syncTasks) collections.push({ crmType: "task", name: "tasks" });
  if (integration.syncAppointments) collections.push({ crmType: "appointment", name: "appointments" });
  if (integration.syncReminders) collections.push({ crmType: "personalReminder", name: "personalReminders" });

  for (const { crmType, name } of collections) {
    const snap = await db.collection(`organizations/${ORG_ID}/${name}`).get();
    for (const doc of snap.docs) {
      const item = { id: doc.id, ...doc.data() } as CrmTask | CrmAppointment | CrmPersonalReminder;
      if (!relevantUserIds(crmType, item).includes(uid)) continue;
      await syncItemForUser(db, uid, crmType, doc.id, "upsert", item);
      synced++;
    }
  }

  await saveIntegration(db, uid, {
    lastSyncAt: new Date().toISOString(),
    lastError: "",
  });
  return synced;
}
