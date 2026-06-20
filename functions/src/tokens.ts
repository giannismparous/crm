import { google } from "googleapis";
import type { Firestore } from "firebase-admin/firestore";
import type { GoogleCalendarIntegration } from "./constants";
import { googleClientId, googleClientSecret, googleRedirectUri, integrationRef } from "./config";

export function createOAuthClient() {
  const clientId = googleClientId.value() || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = googleClientSecret.value() || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  const redirectUri = googleRedirectUri.value() || process.env.GOOGLE_OAUTH_REDIRECT_URI || "";
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function loadIntegration(
  db: Firestore,
  uid: string
): Promise<GoogleCalendarIntegration | null> {
  const snap = await integrationRef(db, uid).get();
  if (!snap.exists) return null;
  return snap.data() as GoogleCalendarIntegration;
}

export async function saveIntegration(
  db: Firestore,
  uid: string,
  patch: Partial<GoogleCalendarIntegration>
): Promise<void> {
  await integrationRef(db, uid).set(patch, { merge: true });
}

export async function getAuthedCalendarClient(db: Firestore, uid: string) {
  const integration = await loadIntegration(db, uid);
  if (!integration?.connected || !integration.refreshToken) {
    throw new Error("Google Calendar is not connected.");
  }

  const oauth = createOAuthClient();
  oauth.setCredentials({
    refresh_token: integration.refreshToken,
    access_token: integration.accessToken,
    expiry_date: integration.accessTokenExpiresAt,
  });

  const needsRefresh =
    !integration.accessToken ||
    !integration.accessTokenExpiresAt ||
    integration.accessTokenExpiresAt < Date.now() + 60_000;

  if (needsRefresh) {
    const { credentials } = await oauth.refreshAccessToken();
    await saveIntegration(db, uid, {
      accessToken: credentials.access_token ?? undefined,
      accessTokenExpiresAt: credentials.expiry_date ?? undefined,
    });
    oauth.setCredentials(credentials);
  }

  return google.calendar({ version: "v3", auth: oauth });
}
