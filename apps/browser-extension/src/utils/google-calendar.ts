import { type CalendarEvent, logger } from '@cuewise/shared';

// Read-only Google Calendar access via chrome.identity. All client-side: the
// extension talks to Google directly, no Cuewise backend ever sees the data.
//
// The `identity` permission and the Google API hosts are *optional* — declared
// in the manifest but granted only when the user clicks Connect (see
// connectCalendar), and released on disconnect. A user who never enables the
// calendar carries no Google-related permissions. The manifest `oauth2` block (a
// Chrome-Extension OAuth client id + the calendar.readonly scope) is static
// config, not a grant.

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// The optional permissions the calendar needs: requested together on Connect and
// handed back on disconnect. Origins cover the Calendar API and token revoke.
const CALENDAR_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: ['identity'],
  origins: ['https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*'],
};

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
  // Provisioned (manifest has an OAuth client id) and running in the installed
  // extension, where chrome.permissions exists. Deliberately does NOT check
  // chrome.identity: that API only appears once the user grants the optional
  // permission, yet the feature must be offered (the Connect button) before
  // then. In the Vite dev server `chrome` is absent, so this is false and
  // Connect reports the calendar is unavailable (no events are fabricated).
  if (
    typeof chrome === 'undefined' ||
    !chrome.permissions?.request ||
    !chrome.runtime?.getManifest
  ) {
    return false;
  }
  const oauth2 = chrome.runtime.getManifest().oauth2 as { client_id?: string } | undefined;
  return Boolean(oauth2?.client_id);
}

// Whether to surface the calendar companion in the UI at all: a configured
// OAuth client (installed extension), or the Vite dev server so the layout is
// reviewable (Connect is unavailable there). A production build without a client
// id hides the companion entirely so users never reach a dead "not set up" path.
export function isCalendarFeatureEnabled(): boolean {
  return isCalendarAvailable() || import.meta.env.DEV;
}

function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!chrome.identity?.getAuthToken) {
      reject(new Error('Calendar permission not granted'));
      return;
    }
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

// Request the optional permissions. Must be called from a user gesture (the
// Connect button) or Chrome rejects it. Resolves false if the user declines.
function requestCalendarPermission(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    chrome.permissions.request(CALENDAR_PERMISSIONS, (granted) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(Boolean(granted));
    });
  });
}

// Grant the optional permissions, then run interactive Google consent. Throws if
// the user declines either step so the store stays disconnected. Prompts the
// first time; refreshes afterward are silent.
export async function connectCalendar(): Promise<void> {
  const granted = await requestCalendarPermission();
  if (!granted) {
    throw new Error('Calendar permission was not granted');
  }
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

// Hand the optional permissions back so a disconnected user keeps no
// Google-related grant. Best-effort: never blocks the local disconnect.
function removeCalendarPermission(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.permissions?.remove) {
      resolve();
      return;
    }
    chrome.permissions.remove(CALENDAR_PERMISSIONS, () => resolve());
  });
}

// Revoke the token, drop the cached one, then release the optional permissions so
// disconnect is a clean reset back to a no-Google-access state.
export async function disconnectCalendar(): Promise<void> {
  try {
    const token = await getToken(false).catch(() => null);
    if (token) {
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, () => resolve());
      });
      await fetch(`${REVOKE_URL}?token=${token}`, { method: 'POST' }).catch(() => {});
    }
  } catch (error) {
    logger.warn('Calendar disconnect cleanup failed', { error });
  }
  await removeCalendarPermission();
}
