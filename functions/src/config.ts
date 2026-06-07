import type { Firestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";

export const googleClientId = defineString("GOOGLE_OAUTH_CLIENT_ID");
export const googleClientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
export const googleRedirectUri = defineString("GOOGLE_OAUTH_REDIRECT_URI");
export const crmAppUrl = defineString("CRM_APP_URL", { default: "http://localhost:5173" });

export function integrationRef(db: Firestore, uid: string) {
  return db.doc(`users/${uid}/integrations/googleCalendar`);
}

export function eventMapRef(db: Firestore, uid: string, mapId: string) {
  return db.doc(`users/${uid}/integrations/googleCalendar/events/${mapId}`);
}

export function eventMapId(crmType: string, crmId: string) {
  return `${crmType}_${crmId}`;
}
