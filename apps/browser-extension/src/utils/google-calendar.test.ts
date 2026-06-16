import { getNextDayDateString, getTodayDateString, getYesterdayDateString } from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectCalendar,
  disconnectCalendar,
  fetchTodayEvents,
  isCalendarAvailable,
  isCalendarFeatureEnabled,
} from './google-calendar';

interface GoogleEventInput {
  id: string;
  summary?: string;
  colorId?: string;
  htmlLink?: string;
  status?: string;
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

// chrome.identity / chrome.runtime / chrome.permissions aren't in the shared
// vitest setup (which only mocks chrome.storage and rebuilds global.chrome before
// each test), so each test installs the bits google-calendar.ts uses. stringToken
// models Chrome's older bare-string callback (vs the {token} object).
// withoutIdentity simulates a provisioned build before the optional `identity`
// permission is granted; permissionGranted controls the request() outcome.
function installIdentity(
  options: {
    token?: string;
    stringToken?: string;
    clientId?: string;
    lastError?: string;
    withoutIdentity?: boolean;
    permissionGranted?: boolean;
  } = {}
) {
  const result = options.stringToken !== undefined ? options.stringToken : { token: options.token };
  const identity = {
    getAuthToken: vi.fn((_details: unknown, cb: (result: { token?: string } | string) => void) =>
      cb(result)
    ),
    removeCachedAuthToken: vi.fn((_details: unknown, cb: () => void) => cb()),
  };
  const runtime = {
    lastError: options.lastError ? { message: options.lastError } : undefined,
    getManifest: vi.fn(() => ({
      oauth2: options.clientId ? { client_id: options.clientId } : undefined,
    })),
  };
  const permissions = {
    request: vi.fn((_perms: unknown, cb: (granted: boolean) => void) =>
      cb(options.permissionGranted ?? true)
    ),
    remove: vi.fn((_perms: unknown, cb: (removed: boolean) => void) => cb(true)),
    contains: vi.fn((_perms: unknown, cb: (granted: boolean) => void) => cb(true)),
  };
  Object.assign(global.chrome, { runtime, permissions });
  if (!options.withoutIdentity) {
    Object.assign(global.chrome, { identity });
  }
  return { identity, runtime, permissions };
}

function stubFetchItems(items: GoogleEventInput[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('isCalendarAvailable', () => {
  it('is false outside the installed extension (no chrome.permissions/runtime)', () => {
    expect(isCalendarAvailable()).toBe(false);
  });

  it('is false when no OAuth client id is configured', () => {
    installIdentity({ clientId: undefined });
    expect(isCalendarAvailable()).toBe(false);
  });

  it('is true for a provisioned build even before identity is granted', () => {
    // withoutIdentity: chrome.identity is absent until the optional permission is
    // granted, yet the feature must still be offered so the Connect button shows.
    installIdentity({ clientId: 'abc.apps.googleusercontent.com', withoutIdentity: true });
    expect(isCalendarAvailable()).toBe(true);
  });
});

describe('connectCalendar', () => {
  it('requests the optional permission, then runs interactive consent', async () => {
    const { identity, permissions } = installIdentity({
      token: 'tok',
      clientId: 'abc.apps.googleusercontent.com',
      permissionGranted: true,
    });

    await connectCalendar();

    expect(permissions.request).toHaveBeenCalledOnce();
    expect(identity.getAuthToken).toHaveBeenCalledWith({ interactive: true }, expect.any(Function));
  });

  it('throws and skips consent when the permission is declined', async () => {
    const { identity } = installIdentity({
      clientId: 'abc.apps.googleusercontent.com',
      permissionGranted: false,
    });

    await expect(connectCalendar()).rejects.toThrow('Calendar permission was not granted');
    expect(identity.getAuthToken).not.toHaveBeenCalled();
  });
});

describe('disconnectCalendar', () => {
  it('revokes the token and releases the optional permissions', async () => {
    const { identity, permissions } = installIdentity({
      token: 'tok',
      clientId: 'abc.apps.googleusercontent.com',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true }))
    );

    await disconnectCalendar();

    expect(identity.removeCachedAuthToken).toHaveBeenCalledOnce();
    expect(permissions.remove).toHaveBeenCalledOnce();
  });

  it('revokes the cached token at Google', async () => {
    installIdentity({ token: 'tok', clientId: 'abc.apps.googleusercontent.com' });
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await disconnectCalendar();

    expect(fetchMock).toHaveBeenCalledWith('https://oauth2.googleapis.com/revoke?token=tok', {
      method: 'POST',
    });
  });

  it('url-encodes a token with reserved characters in the revoke request', async () => {
    installIdentity({ token: 'a/b+c=', clientId: 'abc.apps.googleusercontent.com' });
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await disconnectCalendar();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/revoke?token=a%2Fb%2Bc%3D',
      { method: 'POST' }
    );
  });

  it('releases the permissions even when the revoke request fails', async () => {
    const { permissions } = installIdentity({
      token: 'tok',
      clientId: 'abc.apps.googleusercontent.com',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network')))
    );

    await expect(disconnectCalendar()).resolves.toBeUndefined();
    expect(permissions.remove).toHaveBeenCalledOnce();
  });

  it('still releases the permissions when no token is cached', async () => {
    const { identity, permissions } = installIdentity({
      token: undefined,
      clientId: 'abc.apps.googleusercontent.com',
    });

    await disconnectCalendar();

    expect(identity.removeCachedAuthToken).not.toHaveBeenCalled();
    expect(permissions.remove).toHaveBeenCalledOnce();
  });
});

describe('isCalendarFeatureEnabled', () => {
  it('is enabled in the dev server even without a configured client id', () => {
    vi.stubEnv('DEV', true);
    expect(isCalendarFeatureEnabled()).toBe(true);
  });

  it('is hidden in a production build with no client id', () => {
    vi.stubEnv('DEV', false);
    installIdentity({ clientId: undefined });
    expect(isCalendarFeatureEnabled()).toBe(false);
  });

  it('is enabled in a production build when a client id is configured', () => {
    vi.stubEnv('DEV', false);
    installIdentity({ clientId: 'abc.apps.googleusercontent.com' });
    expect(isCalendarFeatureEnabled()).toBe(true);
  });
});

describe('fetchTodayEvents', () => {
  beforeEach(() => {
    installIdentity({ token: 'tok', clientId: 'abc.apps.googleusercontent.com' });
  });

  it('maps a timed event with its color', async () => {
    stubFetchItems([
      {
        id: 't1',
        summary: 'Standup',
        colorId: '7',
        htmlLink: 'https://cal/t1',
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T09:15:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toEqual([
      {
        id: 't1',
        title: 'Standup',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-14T09:15:00Z',
        allDay: false,
        color: '#039be5',
        htmlLink: 'https://cal/t1',
      },
    ]);
  });

  it('flags all-day events and keeps their date-only strings', async () => {
    const today = getTodayDateString();
    stubFetchItems([
      {
        id: 'a1',
        summary: 'Holiday',
        start: { date: today },
        end: { date: getNextDayDateString() },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    expect(events[0].start).toBe(today);
    expect(events[0].color).toBeUndefined();
  });

  it("drops an all-day event that doesn't cover today", async () => {
    // Tomorrow's all-day banner can slip across the window boundary; it must not
    // appear in today's agenda.
    stubFetchItems([
      {
        id: 'tomorrow',
        summary: 'Future holiday',
        start: { date: getNextDayDateString() },
        end: { date: '2999-01-01' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toEqual([]);
  });

  it('keeps a multi-day all-day event that spans today', async () => {
    stubFetchItems([
      {
        id: 'vacation',
        summary: 'Vacation',
        start: { date: getYesterdayDateString() },
        end: { date: getNextDayDateString() },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('vacation');
  });

  it('falls back to a placeholder title when summary is missing', async () => {
    stubFetchItems([
      {
        id: 'n1',
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T10:00:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('(no title)');
  });

  it('leaves color undefined for a timed event without a colorId', async () => {
    stubFetchItems([
      {
        id: 'nc',
        summary: 'No color',
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T10:00:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events[0].color).toBeUndefined();
  });

  it('evicts a stale token and retries once on a 401', async () => {
    const { identity } = installIdentity({
      token: 'tok',
      clientId: 'abc.apps.googleusercontent.com',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    const events = await fetchTodayEvents();

    expect(identity.removeCachedAuthToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toEqual([]);
  });

  it('drops malformed events that have no start or end', async () => {
    stubFetchItems([
      { id: 'bad', summary: 'No times' },
      {
        id: 'ok',
        summary: 'Good',
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T10:00:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('ok');
  });

  it('drops cancelled events', async () => {
    stubFetchItems([
      {
        id: 'gone',
        summary: 'Cancelled',
        status: 'cancelled',
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T10:00:00Z' },
      },
      {
        id: 'ok',
        summary: 'Good',
        start: { dateTime: '2026-06-14T11:00:00Z' },
        end: { dateTime: '2026-06-14T12:00:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('ok');
  });

  it('drops a cancelled event even when the user had accepted it', async () => {
    stubFetchItems([
      {
        id: 'gone',
        summary: 'Was on, now cancelled',
        status: 'cancelled',
        attendees: [{ self: true, responseStatus: 'accepted' }],
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T10:00:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toEqual([]);
  });

  it('keeps an event the user has not yet responded to (needsAction)', async () => {
    stubFetchItems([
      {
        id: 'maybe',
        summary: 'Invite',
        attendees: [{ self: true, responseStatus: 'needsAction' }],
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T10:00:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('maybe');
  });

  it('drops events the signed-in user has declined', async () => {
    stubFetchItems([
      {
        id: 'declined',
        summary: 'Optional sync',
        attendees: [{ self: true, responseStatus: 'declined' }],
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T10:00:00Z' },
      },
      {
        id: 'accepted',
        summary: 'Standup',
        attendees: [{ self: true, responseStatus: 'accepted' }],
        start: { dateTime: '2026-06-14T11:00:00Z' },
        end: { dateTime: '2026-06-14T12:00:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('accepted');
  });

  it('throws when the Calendar API responds with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 401, statusText: 'Unauthorized' }))
    );

    await expect(fetchTodayEvents()).rejects.toThrow('Calendar API: 401 Unauthorized');
  });
});

describe('getToken (via fetchTodayEvents)', () => {
  it('rejects when no token is returned', async () => {
    installIdentity({ token: undefined, clientId: 'abc.apps.googleusercontent.com' });

    await expect(fetchTodayEvents()).rejects.toThrow('No auth token');
  });

  it('rejects with the chrome runtime error message', async () => {
    installIdentity({ lastError: 'consent required', clientId: 'abc.apps.googleusercontent.com' });

    await expect(fetchTodayEvents()).rejects.toThrow('consent required');
  });

  it('accepts a bare string token (older Chrome callback shape)', async () => {
    installIdentity({ stringToken: 'tok', clientId: 'abc.apps.googleusercontent.com' });
    stubFetchItems([
      {
        id: 's1',
        summary: 'Sync',
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T09:30:00Z' },
      },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('s1');
  });
});
