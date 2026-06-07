import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { randomBytes } from "crypto";
import { google } from "googleapis";
import type { CrmType, SyncAction } from "./constants";
import { CALENDAR_SCOPE } from "./constants";
import {
  crmAppUrl,
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  integrationRef,
} from "./config";
import { ensureSimasiaCalendar } from "./calendarSetup";
import { createOAuthClient, getAuthedCalendarClient, loadIntegration, saveIntegration } from "./tokens";
import { fullSyncForUser, syncItemForAllUsers } from "./sync";

initializeApp();
const db = getFirestore();

function requireAuthUid(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return auth.uid;
}

function publicIntegrationView(data: Record<string, unknown> | undefined) {
  if (!data) {
    return {
      connected: false,
      googleEmail: null,
      syncTasks: true,
      syncAppointments: true,
      syncReminders: true,
      lastSyncAt: null,
      lastError: null,
    };
  }
  return {
    connected: Boolean(data.connected),
    googleEmail: (data.googleEmail as string) ?? null,
    syncTasks: data.syncTasks !== false,
    syncAppointments: data.syncAppointments !== false,
    syncReminders: data.syncReminders !== false,
    lastSyncAt: (data.lastSyncAt as string) ?? null,
    lastError: (data.lastError as string) ?? null,
  };
}

const fnOpts = { region: "us-central1" as const, secrets: [googleClientSecret] };

export const getGoogleCalendarStatus = onCall(
  fnOpts,
  async (request) => {
    const uid = requireAuthUid(request.auth);
    const snap = await integrationRef(db, uid).get();
    return publicIntegrationView(snap.data());
  }
);

export const startGoogleCalendarConnect = onCall(
  fnOpts,
  async (request) => {
    const uid = requireAuthUid(request.auth);
    const state = randomBytes(24).toString("hex");
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await db.doc(`oauthStates/${state}`).set({
      uid,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    const oauth = createOAuthClient();
    const authUrl = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [CALENDAR_SCOPE, "openid", "email"],
      state,
    });

    return { authUrl };
  }
);

export const googleCalendarOAuthCallback = onRequest(
  { region: "us-central1", secrets: [googleClientSecret], cors: false },
  async (req, res) => {
    const appBase = crmAppUrl.value().replace(/\/$/, "");
    const fail = (message: string) => {
      res.redirect(`${appBase}/?googleCalendar=error&message=${encodeURIComponent(message)}`);
    };

    try {
      const code = String(req.query.code ?? "");
      const state = String(req.query.state ?? "");
      if (!code || !state) {
        fail("Missing OAuth code.");
        return;
      }

      const stateRef = db.doc(`oauthStates/${state}`);
      const stateSnap = await stateRef.get();
      if (!stateSnap.exists) {
        fail("Invalid or expired OAuth state.");
        return;
      }

      const { uid, expiresAt } = stateSnap.data() as { uid: string; expiresAt: number };
      if (!uid || expiresAt < Date.now()) {
        await stateRef.delete();
        fail("OAuth session expired. Try connecting again.");
        return;
      }

      const oauth = createOAuthClient();
      const { tokens } = await oauth.getToken(code);
      oauth.setCredentials(tokens);

      let googleEmail = "";
      try {
        const oauth2 = google.oauth2({ version: "v2", auth: oauth });
        const { data: profile } = await oauth2.userinfo.get();
        googleEmail = String(profile.email ?? "");
      } catch {
        googleEmail = "";
      }

      const existing = await loadIntegration(db, uid);
      if (!tokens.refresh_token && !existing?.refreshToken) {
        await stateRef.delete();
        fail("Google did not return a refresh token. Disconnect the app in Google Account settings and try again.");
        return;
      }

      await saveIntegration(db, uid, {
        connected: true,
        googleEmail: googleEmail || undefined,
        calendarId: existing?.calendarId || "primary",
        refreshToken: tokens.refresh_token ?? existing?.refreshToken,
        accessToken: tokens.access_token ?? undefined,
        accessTokenExpiresAt: tokens.expiry_date ?? undefined,
        syncTasks: true,
        syncAppointments: true,
        syncReminders: true,
        connectedAt: new Date().toISOString(),
        lastError: "",
      });

      await stateRef.delete();

      try {
        await ensureSimasiaCalendar(db, uid);
        await fullSyncForUser(db, uid);
      } catch (syncErr) {
        const msg = syncErr instanceof Error ? syncErr.message : "Initial sync failed.";
        await saveIntegration(db, uid, { lastError: msg });
      }

      res.redirect(`${appBase}/?googleCalendar=connected`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OAuth failed.";
      fail(msg);
    }
  }
);

export const disconnectGoogleCalendar = onCall(
  fnOpts,
  async (request) => {
    const uid = requireAuthUid(request.auth);
    const integration = await loadIntegration(db, uid);
    if (integration?.refreshToken) {
      try {
        const oauth = createOAuthClient();
        await oauth.revokeToken(integration.refreshToken);
      } catch {
        /* ignore revoke failures */
      }
    }

    const calendarId = integration?.calendarId || "primary";
    const eventsSnap = await db.collection(`users/${uid}/integrations/googleCalendar/events`).get();
    if (integration?.connected && eventsSnap.docs.length > 0) {
      try {
        const calendar = await getAuthedCalendarClient(db, uid);
        await Promise.all(
          eventsSnap.docs.map(async (mapDoc) => {
            const { googleEventId } = mapDoc.data() as { googleEventId: string };
            try {
              await calendar.events.delete({ calendarId, eventId: googleEventId });
            } catch (err) {
              const code = (err as { code?: number })?.code;
              if (code !== 404 && code !== 410) throw err;
            }
          })
        );
      } catch {
        /* best-effort cleanup */
      }
    }

    const batch = db.batch();
    eventsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(integrationRef(db, uid));
    await batch.commit();

    return { ok: true };
  }
);

export const updateGoogleCalendarSyncOptions = onCall(
  fnOpts,
  async (request) => {
    const uid = requireAuthUid(request.auth);
    const data = request.data as {
      syncTasks?: boolean;
      syncAppointments?: boolean;
      syncReminders?: boolean;
    };

    const integration = await loadIntegration(db, uid);
    if (!integration?.connected) {
      throw new HttpsError("failed-precondition", "Connect Google Calendar first.");
    }

    await saveIntegration(db, uid, {
      syncTasks: data.syncTasks !== false,
      syncAppointments: data.syncAppointments !== false,
      syncReminders: data.syncReminders !== false,
    });

    return publicIntegrationView({
      ...integration,
      syncTasks: data.syncTasks !== false,
      syncAppointments: data.syncAppointments !== false,
      syncReminders: data.syncReminders !== false,
    });
  }
);

export const syncGoogleCalendarForUser = onCall(
  fnOpts,
  async (request) => {
    const uid = requireAuthUid(request.auth);
    try {
      const count = await fullSyncForUser(db, uid);
      return { ok: true, synced: count };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed.";
      await saveIntegration(db, uid, { lastError: msg });
      throw new HttpsError("internal", msg);
    }
  }
);

export const syncGoogleCalendarItem = onCall(
  fnOpts,
  async (request) => {
    requireAuthUid(request.auth);
    const data = request.data as {
      crmType?: CrmType;
      crmId?: string;
      action?: SyncAction;
    };

    const crmType = data.crmType;
    const crmId = String(data.crmId ?? "").trim();
    const action: SyncAction = data.action === "delete" ? "delete" : "upsert";

    if (!crmType || !crmId) {
      throw new HttpsError("invalid-argument", "crmType and crmId are required.");
    }
    if (!["task", "appointment", "personalReminder"].includes(crmType)) {
      throw new HttpsError("invalid-argument", "Invalid crmType.");
    }

    try {
      await syncItemForAllUsers(db, crmType, crmId, action);
      return { ok: true };
    } catch (err) {
      console.error("syncGoogleCalendarItem", err);
      return { ok: false };
    }
  }
);

/** Re-sync calendar when a person's departments change (partner visibility). */
export const onPersonDepartmentsCalendarSync = onDocumentUpdated(
  {
    document: "organizations/SimasiaAI/people/{personId}",
    region: "us-central1",
    secrets: [googleClientSecret],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const deptBefore = JSON.stringify(before.departments ?? []);
    const deptAfter = JSON.stringify(after.departments ?? []);
    if (deptBefore === deptAfter) return;

    const uid = event.params.personId;
    try {
      await fullSyncForUser(db, uid);
    } catch {
      /* user not connected or sync skipped */
    }
  }
);

// Export config param names for deploy docs
export const _config = {
  googleClientId,
  googleRedirectUri,
  crmAppUrl,
};
