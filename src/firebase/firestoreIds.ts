import { collection, doc } from "firebase/firestore";
import { getFirestoreDb, SIMASIA_AI_ORG_ID } from "./config";

/** Pre-generate a Firestore document id (e.g. before first save). */
export function newContactDocId(): string {
  return doc(collection(getFirestoreDb(), "organizations", SIMASIA_AI_ORG_ID, "contacts")).id;
}

export function newAppointmentDocId(): string {
  return doc(collection(getFirestoreDb(), "organizations", SIMASIA_AI_ORG_ID, "appointments")).id;
}

export function newTaskDocId(): string {
  return doc(collection(getFirestoreDb(), "organizations", SIMASIA_AI_ORG_ID, "tasks")).id;
}

export function newResearchDocId(): string {
  return doc(collection(getFirestoreDb(), "organizations", SIMASIA_AI_ORG_ID, "research")).id;
}

export function newPersonalReminderDocId(): string {
  return doc(
    collection(getFirestoreDb(), "organizations", SIMASIA_AI_ORG_ID, "personalReminders")
  ).id;
}

export function newContactReminderDocId(contactId: string): string {
  return doc(
    collection(getFirestoreDb(), "organizations", SIMASIA_AI_ORG_ID, "contacts", contactId, "reminders")
  ).id;
}
