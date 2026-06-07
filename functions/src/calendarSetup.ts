import type { Firestore } from "firebase-admin/firestore";
import { ORG_TIMEZONE } from "./constants";
import { getAuthedCalendarClient, saveIntegration } from "./tokens";

export const SIMASIA_CALENDAR_NAME = "SimasiaAI CRM";
const SIMASIA_CALENDAR_DESCRIPTION =
  "Tasks, meetings, and reminders synced from SimasiaAI CRM. Toggle this calendar on or off in Google Calendar.";

/** Create or reuse a dedicated secondary calendar the user can show/hide in Google Calendar. */
export async function ensureSimasiaCalendar(db: Firestore, uid: string): Promise<string> {
  const calendar = await getAuthedCalendarClient(db, uid);
  const list = await calendar.calendarList.list({ showHidden: true });
  const existing = list.data.items?.find(
    (entry) => entry.summary === SIMASIA_CALENDAR_NAME && entry.accessRole !== "freeBusyReader"
  );

  if (existing?.id) {
    await saveIntegration(db, uid, { calendarId: existing.id });
    return existing.id;
  }

  const created = await calendar.calendars.insert({
    requestBody: {
      summary: SIMASIA_CALENDAR_NAME,
      description: SIMASIA_CALENDAR_DESCRIPTION,
      timeZone: ORG_TIMEZONE,
    },
  });

  const calendarId = created.data.id;
  if (!calendarId) throw new Error("Could not create SimasiaAI CRM calendar.");

  await calendar.calendarList.insert({
    requestBody: {
      id: calendarId,
      selected: true,
      colorId: "9",
    },
  });

  await saveIntegration(db, uid, { calendarId });
  return calendarId;
}
