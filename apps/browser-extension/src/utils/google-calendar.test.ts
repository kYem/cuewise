import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTodayEvents, isCalendarAvailable } from './google-calendar';

interface GoogleEventInput {
  id: string;
  summary?: string;
  colorId?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

// chrome.identity / chrome.runtime aren't in the shared vitest setup (which only
// mocks chrome.storage), so each test installs the bits google-calendar.ts uses.
// stringToken models Chrome's older bare-string callback (vs the {token} object).
function installIdentity(
  options: { token?: string; stringToken?: string; clientId?: string; lastError?: string } = {}
) {
  const result = options.stringToken !== undefined ? options.stringToken : { token: options.token };
  const identity = {
    getAuthToken: vi.fn((_details: unknown, cb: (result: { token?: string } | string) => void) =>
      cb(result)
    ),
  };
  const runtime = {
    lastError: options.lastError ? { message: options.lastError } : undefined,
    getManifest: vi.fn(() => ({
      oauth2: options.clientId ? { client_id: options.clientId } : undefined,
    })),
  };
  Object.assign(global.chrome, { identity, runtime });
}

function stubFetchItems(items: GoogleEventInput[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isCalendarAvailable', () => {
  it('is false when chrome.identity is absent', () => {
    expect(isCalendarAvailable()).toBe(false);
  });

  it('is false when no OAuth client id is configured', () => {
    installIdentity({ clientId: undefined });
    expect(isCalendarAvailable()).toBe(false);
  });

  it('is true when identity exists and a client id is configured', () => {
    installIdentity({ clientId: 'abc.apps.googleusercontent.com' });
    expect(isCalendarAvailable()).toBe(true);
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
    stubFetchItems([
      { id: 'a1', summary: 'Holiday', start: { date: '2026-06-14' }, end: { date: '2026-06-15' } },
    ]);

    const events = await fetchTodayEvents();

    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    expect(events[0].start).toBe('2026-06-14');
    expect(events[0].color).toBeUndefined();
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
