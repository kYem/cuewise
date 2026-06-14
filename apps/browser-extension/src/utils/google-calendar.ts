import { type CalendarEvent, logger } from '@cuewise/shared';

// Read-only Google Calendar access via chrome.identity. All client-side: the
// extension talks to Google directly, no Cuewise backend ever sees the data.
//
// Requires the manifest `oauth2` block (a Chrome-Extension OAuth client id +
// the calendar.readonly scope) and the `identity` permission. chrome.identity
// only exists in the installed extension — not the Vite dev server — so callers
// guard with isCalendarAvailable() and fall back to sample data in dev.

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// Google's standard event colorId → hex, used for the strip accent bar.
const EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb',
  '2': '#33b679',
  '3': '#8e24aa',
  '4': '#e67c73',
  '5': '#f6bf26',
  '6': '#f4511e',
  '7': '#039be5',
  '8': '#616161',
  '9': '#3f51b5',
  '10': '#0b8043',
  '11': '#d50000',
};

interface GoogleEvent {
  id: string;
  summary?: string;
  htmlLink?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export function isCalendarAvailable(): boolean {
  if (typeof chrome === 'undefined' || !chrome.identity?.getAuthToken) {
    return false;
  }
  // Without a configured OAuth client id, getAuthToken can't succeed — treat as
  // unavailable so callers take the dev sample fallback / not-configured path
  // instead of erroring on connect.
  const oauth2 = chrome.runtime.getManifest().oauth2 as { client_id?: string } | undefined;
  return Boolean(oauth2?.client_id);
}

function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const token = typeof result === 'string' ? result : result?.token;
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'No auth token'));
        return;
      }
      resolve(token);
    });
  });
}

// Returns null for malformed rows (no start/end) so callers can drop them
// rather than emit a CalendarEvent with empty strings that break `new Date(...)`.
function mapEvent(item: GoogleEvent): CalendarEvent | null {
  const start = item.start?.dateTime ?? item.start?.date;
  const end = item.end?.dateTime ?? item.end?.date;
  if (!start || !end) {
    return null;
  }
  return {
    id: item.id,
    title: item.summary ?? '(no title)',
    start,
    end,
    allDay: !item.start?.dateTime,
    color: item.colorId ? EVENT_COLORS[item.colorId] : undefined,
    htmlLink: item.htmlLink,
  };
}

// Interactive consent — prompts the user the first time, silent thereafter.
export async function connectCalendar(): Promise<void> {
  await getToken(true);
}

export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  const token = await getToken(false);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '25',
  });

  const response = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Calendar API: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { items?: GoogleEvent[] };
  return (data.items ?? []).map(mapEvent).filter((event): event is CalendarEvent => event !== null);
}

// Revoke + drop the cached token so disconnect is a clean state reset.
export async function disconnectCalendar(): Promise<void> {
  try {
    const token = await getToken(false).catch(() => null);
    if (!token) {
      return;
    }
    await new Promise<void>((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
    await fetch(`${REVOKE_URL}?token=${token}`, { method: 'POST' }).catch(() => {});
  } catch (error) {
    logger.warn('Calendar disconnect cleanup failed', { error });
  }
}
