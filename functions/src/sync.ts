import type { Firestore } from "firebase-admin/firestore";
import type { calendar_v3 } from "googleapis";
import { ORG_ID, CRM_SOURCE, type CrmType, type SyncAction } from "./constants";
import { eventMapId, eventMapRef } from "./config";
import {
  loadCrmItem,
  shouldSyncItemToCalendar,
  userWantsSync,
  type CrmAppointment,
  type CrmPersonalReminder,
  type CrmTask,
} from "./crmData";
import { loadCalendarBuildContext, loadRelatedForCalendarEvent } from "./calendarContext";
import { buildCalendarEvent } from "./eventBuilder";
import { SIMASIA_CALENDAR_NAME } from "./calendarSetup";
import { getAuthedCalendarClient, loadIntegration, saveIntegration } from "./tokens";
import { itemVisibleToUser, loadOrgContext, type OrgContext } from "./visibility";

/** Stagger Google API calls to stay under per-minute quotas (jitter spreads multi-user load). */
const CALENDAR_SYNC_DELAY_MIN_MS = 100;
const CALENDAR_SYNC_DELAY_MAX_MS = 280;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calendarSyncPause(): Promise<void> {
  const span = CALENDAR_SYNC_DELAY_MAX_MS - CALENDAR_SYNC_DELAY_MIN_MS + 1;
  const ms = CALENDAR_SYNC_DELAY_MIN_MS + Math.floor(Math.random() * span);
  return sleep(ms);
}

function isGoogleRateLimitError(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  if (code === 429) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /rate limit/i.test(msg);
}

async function withGoogleCalendarRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isGoogleRateLimitError(err) || attempt === maxAttempts - 1) throw err;
      await sleep(600 * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

async function buildEventForItem(
  db: Firestore,
  crmType: CrmType,
  item: CrmTask | CrmAppointment | CrmPersonalReminder
): Promise<calendar_v3.Schema$Event | null> {
  const ctx = await loadCalendarBuildContext(db);
  const related = await loadRelatedForCalendarEvent(db, crmType, item, ctx);
  return buildCalendarEvent(crmType, item, ctx, related);
}

export async function listConnectedUserIds(db: Firestore): Promise<string[]> {
  const snap = await db.collectionGroup("integrations").get();
  const ids: string[] = [];
  for (const doc of snap.docs) {
    if (doc.id !== "googleCalendar") continue;
    if (!doc.data().connected) continue;
    const uid = doc.ref.parent.parent?.id;
    if (uid) ids.push(uid);
  }
  return ids;
}

async function mappedUserIdsForItem(
  db: Firestore,
  crmType: CrmType,
  crmId: string
): Promise<string[]> {
  const maps = await db
    .collectionGroup("events")
    .where("crmType", "==", crmType)
    .where("crmId", "==", crmId)
    .get();
  const ids: string[] = [];
  for (const doc of maps.docs) {
    const uid = doc.ref.parent.parent?.parent?.parent?.id;
    if (uid) ids.push(uid);
  }
  return ids;
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
    await withGoogleCalendarRetry(() =>
      calendar.events.delete({ calendarId, eventId: googleEventId })
    );
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 404 && code !== 410) throw err;
  }
  await eventMapRef(db, uid, mapId).delete();
}

function crmIdsFromEvent(event: calendar_v3.Schema$Event): { crmType?: CrmType; crmId?: string } {
  const priv = event.extendedProperties?.private;
  const crmType = priv?.crmType as CrmType | undefined;
  const crmId = String(priv?.crmId ?? "").trim();
  return { crmType, crmId: crmId || undefined };
}

async function findGoogleEventsByCrmItem(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  crmType: CrmType,
  crmId: string
): Promise<calendar_v3.Schema$Event[]> {
  const out: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withGoogleCalendarRetry(() =>
      calendar.events.list({
        calendarId,
        privateExtendedProperty: [
          `crmSource=${CRM_SOURCE}`,
          `crmType=${crmType}`,
          `crmId=${crmId}`,
        ],
        maxResults: 250,
        pageToken,
      })
    );
    out.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

async function deleteDuplicateGoogleEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  crmType: CrmType,
  crmId: string,
  keepEventId: string
): Promise<void> {
  const items = await findGoogleEventsByCrmItem(calendar, calendarId, crmType, crmId);
  for (const item of items) {
    if (!item.id || item.id === keepEventId) continue;
    try {
      await withGoogleCalendarRetry(() =>
        calendar.events.delete({ calendarId, eventId: item.id! })
      );
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code !== 404 && code !== 410) throw err;
    }
    await calendarSyncPause();
  }
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
  const { crmType, crmId } = crmIdsFromEvent(event);

  let googleEventId: string | undefined;

  if (mapSnap.exists) {
    googleEventId = (mapSnap.data() as { googleEventId: string }).googleEventId;
    try {
      const existing = await withGoogleCalendarRetry(() =>
        calendar.events.get({ calendarId, eventId: googleEventId })
      );
      await calendarSyncPause();
      await withGoogleCalendarRetry(() =>
        calendar.events.update({
          calendarId,
          eventId: googleEventId,
          requestBody: {
            ...existing.data,
            ...event,
            id: googleEventId,
          },
        })
      );
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code !== 404 && code !== 410) throw err;
      googleEventId = undefined;
      await eventMapRef(db, uid, mapId).delete();
    }
  }

  if (!googleEventId && crmType && crmId) {
    const matches = await findGoogleEventsByCrmItem(calendar, calendarId, crmType, crmId);
    if (matches[0]?.id) {
      googleEventId = matches[0].id;
      const existing = await withGoogleCalendarRetry(() =>
        calendar.events.get({ calendarId, eventId: googleEventId })
      );
      await calendarSyncPause();
      await withGoogleCalendarRetry(() =>
        calendar.events.update({
          calendarId,
          eventId: googleEventId,
          requestBody: {
            ...existing.data,
            ...event,
            id: googleEventId,
          },
        })
      );
    }
  }

  if (!googleEventId) {
    await calendarSyncPause();
    const created = await withGoogleCalendarRetry(() =>
      calendar.events.insert({
        calendarId,
        requestBody: event,
      })
    );
    googleEventId = created.data.id ?? undefined;
    if (!googleEventId) throw new Error("Google Calendar did not return an event id.");
  }

  if (crmType && crmId) {
    await deleteDuplicateGoogleEvents(calendar, calendarId, crmType, crmId, googleEventId);
  }

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
  item?: CrmTask | CrmAppointment | CrmPersonalReminder | null,
  ctx?: OrgContext
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

  const orgCtx = ctx ?? (await loadOrgContext(db));
  if (!itemVisibleToUser(orgCtx, uid, crmType, loaded)) {
    await deleteMappedEvent(db, uid, mapId, calendarId);
    return;
  }

  if (!shouldSyncItemToCalendar(crmType, loaded)) {
    await deleteMappedEvent(db, uid, mapId, calendarId);
    return;
  }

  const event = await buildEventForItem(db, crmType, loaded);
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
): Promise<{ ok: boolean; errors: string[]; rateLimitHit: boolean }> {
  const errors: string[] = [];
  let rateLimitHit = false;

  if (action === "delete") {
    const maps = await db
      .collectionGroup("events")
      .where("crmType", "==", crmType)
      .where("crmId", "==", crmId)
      .get();
    for (const mapDoc of maps.docs) {
      const uid = mapDoc.ref.parent.parent?.parent?.parent?.id;
      if (!uid) continue;
      const integration = await loadIntegration(db, uid);
      if (!integration?.connected) continue;
      const calendarId = integration.calendarId || "primary";
      const { googleEventId } = mapDoc.data() as { googleEventId: string };
      try {
        const calendar = await getAuthedCalendarClient(db, uid);
        await withGoogleCalendarRetry(() =>
          calendar.events.delete({ calendarId, eventId: googleEventId })
        );
      } catch (err) {
        const code = (err as { code?: number })?.code;
        if (code === 404 || code === 410) {
          /* already gone */
        } else {
          const msg = err instanceof Error ? err.message : "Calendar delete failed.";
          if (isGoogleRateLimitError(err)) rateLimitHit = true;
          errors.push(msg);
        }
      }
      await mapDoc.ref.delete();
      await calendarSyncPause();
    }
    return { ok: errors.length === 0, errors, rateLimitHit };
  }

  const item = await loadCrmItem(db, crmType, crmId);
  const ctx = await loadOrgContext(db);

  const [connected, mapped] = await Promise.all([
    listConnectedUserIds(db),
    mappedUserIdsForItem(db, crmType, crmId),
  ]);
  const userIds = [...new Set([...connected, ...mapped])];

  for (const userId of userIds) {
    try {
      await syncItemForUser(db, userId, crmType, crmId, "upsert", item, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Calendar sync failed.";
      console.error(`syncItemForUser ${crmType}/${crmId} for ${userId}:`, err);
      if (isGoogleRateLimitError(err)) rateLimitHit = true;
      errors.push(msg);
    }
    await calendarSyncPause();
  }

  return { ok: errors.length === 0, errors, rateLimitHit };
}

export type FullSyncOptions = {
  /** Skip CRM items before today in the org timezone (default true). */
  fromTodayOnly?: boolean;
};

export async function fullSyncForUser(
  db: Firestore,
  uid: string,
  options: FullSyncOptions = {}
): Promise<number> {
  const fromTodayOnly = options.fromTodayOnly !== false;
  const integration = await loadIntegration(db, uid);
  if (!integration?.connected) throw new Error("Google Calendar is not connected.");

  const ctx = await loadOrgContext(db);
  let synced = 0;
  let rateLimitHit = false;
  const collections: Array<{ crmType: CrmType; name: string }> = [];

  if (integration.syncTasks) collections.push({ crmType: "task", name: "tasks" });
  if (integration.syncAppointments) collections.push({ crmType: "appointment", name: "appointments" });
  if (integration.syncReminders) collections.push({ crmType: "personalReminder", name: "personalReminders" });

  for (const { crmType, name } of collections) {
    const snap = await db.collection(`organizations/${ORG_ID}/${name}`).get();
    for (const doc of snap.docs) {
      const item = { id: doc.id, ...doc.data() } as CrmTask | CrmAppointment | CrmPersonalReminder;
      const visible = itemVisibleToUser(ctx, uid, crmType, item);
      const keepOnCalendar =
        visible && shouldSyncItemToCalendar(crmType, item, { fromTodayOnly });

      try {
        if (!keepOnCalendar) {
          await syncItemForUser(db, uid, crmType, doc.id, "delete", null, ctx);
        } else {
          await syncItemForUser(db, uid, crmType, doc.id, "upsert", item, ctx);
          synced++;
        }
      } catch (err) {
        if (isGoogleRateLimitError(err)) rateLimitHit = true;
        else throw err;
      }
      await calendarSyncPause();
    }
  }

  // Drop stale maps (deleted CRM rows, or items no longer eligible e.g. past canceled).
  const maps = await db.collection(`users/${uid}/integrations/googleCalendar/events`).get();
  for (const mapDoc of maps.docs) {
    const data = mapDoc.data() as { crmType?: CrmType; crmId?: string };
    const crmType = data.crmType;
    const crmId = String(data.crmId ?? "").trim();
    if (!crmType || !crmId) {
      await mapDoc.ref.delete();
      continue;
    }
    const item = await loadCrmItem(db, crmType, crmId);
    const visible = item ? itemVisibleToUser(ctx, uid, crmType, item) : false;
    const keep =
      item && visible && shouldSyncItemToCalendar(crmType, item, { fromTodayOnly });
    if (!keep) {
      const calendarId = integration.calendarId || "primary";
      try {
        await deleteMappedEvent(db, uid, mapDoc.id, calendarId);
      } catch (err) {
        if (isGoogleRateLimitError(err)) rateLimitHit = true;
        else throw err;
      }
      await calendarSyncPause();
    }
  }

  await saveIntegration(db, uid, {
    lastSyncAt: new Date().toISOString(),
    lastError: rateLimitHit
      ? "Google rate limit hit during sync. Most items should be fine — wait a minute and sync again."
      : "",
  });
  return synced;
}

const RICH_DESCRIPTIONS_MIGRATION_ID = "googleCalendarRichDescriptions";
const APPOINTMENT_RSVP_MIGRATION_ID = "appointmentRsvpCalendarDescriptions";

function richDescriptionsMigrationRef(db: Firestore) {
  return db.doc("organizations/SimasiaAI/system/calendarMigrations");
}

async function runRefreshAllConnectedGoogleCalendars(
  db: Firestore,
  migrationId: string,
  options: { force?: boolean } = {}
): Promise<RefreshAllCalendarsResult> {
  const migrationRef = richDescriptionsMigrationRef(db);
  const migrationSnap = await migrationRef.get();
  const migrationData = migrationSnap.data() as Record<string, unknown> | undefined;
  if (!options.force && migrationData?.[migrationId]) {
    return { users: 0, events: 0, skipped: true, errors: [] };
  }

  const userIds = await listConnectedUserIds(db);
  let totalEvents = 0;
  const errors: string[] = [];

  for (const uid of userIds) {
    try {
      const count = await refreshMappedGoogleCalendarEventsForUser(db, uid);
      totalEvents += count;
      await calendarSyncPause();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${uid}: ${msg}`);
      console.error(`refreshAllConnectedGoogleCalendars ${migrationId} ${uid}:`, err);
      await saveIntegration(db, uid, { lastError: msg }).catch(() => undefined);
    }
  }

  await migrationRef.set(
    {
      [migrationId]: {
        completedAt: new Date().toISOString(),
        usersProcessed: userIds.length,
        eventsRefreshed: totalEvents,
        ...(errors.length > 0 ? { errors } : {}),
      },
    },
    { merge: true }
  );

  return { users: userIds.length, events: totalEvents, skipped: false, errors };
}

/** Re-upsert every CRM item that already has a Google event map for this user. */
export async function refreshMappedGoogleCalendarEventsForUser(
  db: Firestore,
  uid: string
): Promise<number> {
  const integration = await loadIntegration(db, uid);
  if (!integration?.connected) return 0;

  const ctx = await loadOrgContext(db);
  const maps = await db.collection(`users/${uid}/integrations/googleCalendar/events`).get();
  let refreshed = 0;

  for (const mapDoc of maps.docs) {
    const data = mapDoc.data() as { crmType?: CrmType; crmId?: string };
    const crmType = data.crmType;
    const crmId = String(data.crmId ?? "").trim();
    if (!crmType || !crmId) continue;
    if (!["task", "appointment", "personalReminder"].includes(crmType)) continue;
    try {
      await syncItemForUser(db, uid, crmType, crmId, "upsert", undefined, ctx);
      refreshed++;
    } catch (err) {
      console.error(`refresh mapped ${crmType}/${crmId} for ${uid}:`, err);
    }
    await calendarSyncPause();
  }

  await saveIntegration(db, uid, {
    lastSyncAt: new Date().toISOString(),
    lastError: "",
  });
  return refreshed;
}

export type RefreshAllCalendarsResult = {
  users: number;
  events: number;
  skipped: boolean;
  errors: string[];
};

/**
 * One-time migration: refresh every existing Google Calendar event for all connected users
 * with the latest descriptive event body (titles, links, review lists, etc.).
 */
export async function refreshAllConnectedGoogleCalendarsOnce(
  db: Firestore,
  options: { force?: boolean } = {}
): Promise<RefreshAllCalendarsResult> {
  return runRefreshAllConnectedGoogleCalendars(db, RICH_DESCRIPTIONS_MIGRATION_ID, options);
}

/** Refresh mapped events after appointment RSVP descriptions ship. */
export async function refreshAllConnectedGoogleCalendarsForRsvpOnce(
  db: Firestore,
  options: { force?: boolean } = {}
): Promise<RefreshAllCalendarsResult> {
  return runRefreshAllConnectedGoogleCalendars(db, APPOINTMENT_RSVP_MIGRATION_ID, options);
}

/** Remove all CRM-synced Google Calendar events while the user is still connected (before token revoke). */
export async function purgeAllGoogleCalendarEventsForUser(db: Firestore, uid: string): Promise<number> {
  const integration = await loadIntegration(db, uid);
  if (!integration?.connected) return 0;

  const calendar = await getAuthedCalendarClient(db, uid);
  const calendarIds = new Set<string>();
  if (integration.calendarId?.trim()) calendarIds.add(integration.calendarId.trim());
  calendarIds.add("primary");

  try {
    const list = await calendar.calendarList.list({ showHidden: true });
    for (const entry of list.data.items ?? []) {
      if (entry.id && entry.summary === SIMASIA_CALENDAR_NAME) calendarIds.add(entry.id);
    }
  } catch {
    /* best-effort */
  }

  let deleted = 0;
  const eventsCol = db.collection(`users/${uid}/integrations/googleCalendar/events`);
  const eventsSnap = await eventsCol.get();

  for (const mapDoc of eventsSnap.docs) {
    const { googleEventId } = mapDoc.data() as { googleEventId?: string };
    const calendarId = integration.calendarId || "primary";
    if (googleEventId) {
      try {
        await withGoogleCalendarRetry(() =>
          calendar.events.delete({ calendarId, eventId: googleEventId })
        );
        deleted++;
      } catch (err) {
        const code = (err as { code?: number })?.code;
        if (code !== 404 && code !== 410) {
          console.warn(`disconnect purge mapped event ${googleEventId}:`, err);
        }
      }
      await calendarSyncPause();
    }
    await mapDoc.ref.delete();
  }

  for (const calendarId of calendarIds) {
    let pageToken: string | undefined;
    do {
      let res;
      try {
        res = await withGoogleCalendarRetry(() =>
          calendar.events.list({
            calendarId,
            privateExtendedProperty: [`crmSource=${CRM_SOURCE}`],
            maxResults: 250,
            pageToken,
          })
        );
      } catch (err) {
        const code = (err as { code?: number })?.code;
        if (code === 404 || code === 403) break;
        console.warn(`disconnect purge list ${calendarId}:`, err);
        break;
      }

      for (const item of res.data.items ?? []) {
        if (!item.id) continue;
        try {
          await withGoogleCalendarRetry(() =>
            calendar.events.delete({ calendarId, eventId: item.id! })
          );
          deleted++;
        } catch (err) {
          const code = (err as { code?: number })?.code;
          if (code !== 404 && code !== 410) {
            console.warn(`disconnect purge event ${item.id}:`, err);
          }
        }
        await calendarSyncPause();
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  return deleted;
}
