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
function installIdentity(options: { token?: string; clientId?: string } = {}) {
  const identity = {
    getAuthToken: vi.fn((_details: unknown, cb: (result: { token?: string }) => void) =>
      cb({ token: options.token })
    ),
  };
  const runtime = {
    lastError: undefined as { message: string } | undefined,
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

    const [event] = await fetchTodayEvents();

    expect(event.allDay).toBe(true);
    expect(event.start).toBe('2026-06-14');
    expect(event.color).toBeUndefined();
  });

  it('falls back to a placeholder title when summary is missing', async () => {
    stubFetchItems([
      {
        id: 'n1',
        start: { dateTime: '2026-06-14T09:00:00Z' },
        end: { dateTime: '2026-06-14T10:00:00Z' },
      },
    ]);

    const [event] = await fetchTodayEvents();

    expect(event.title).toBe('(no title)');
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
