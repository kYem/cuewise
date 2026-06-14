import type { CalendarEvent } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gcal from '../utils/google-calendar';
import { useCalendarStore } from './calendar-store';

vi.mock('@cuewise/storage', () => ({
  getCalendarState: vi.fn(),
  setCalendarState: vi.fn(),
}));

vi.mock('../utils/google-calendar', () => ({
  isCalendarAvailable: vi.fn(),
  connectCalendar: vi.fn(),
  disconnectCalendar: vi.fn(),
  fetchTodayEvents: vi.fn(),
}));

const successMock = vi.fn();
const warningMock = vi.fn();
const errorToastMock = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({ success: successMock, warning: warningMock, error: errorToastMock }),
  },
}));

const getCalendarStateMock = vi.mocked(storage.getCalendarState);
const setCalendarStateMock = vi.mocked(storage.setCalendarState);
const isAvailableMock = vi.mocked(gcal.isCalendarAvailable);
const connectCalendarMock = vi.mocked(gcal.connectCalendar);
const disconnectCalendarMock = vi.mocked(gcal.disconnectCalendar);
const fetchTodayEventsMock = vi.mocked(gcal.fetchTodayEvents);

const liveEvent: CalendarEvent = {
  id: 'live-1',
  title: 'Live meeting',
  start: '2026-06-14T09:00:00Z',
  end: '2026-06-14T09:30:00Z',
  allDay: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCalendarStateMock.mockResolvedValue(null);
  setCalendarStateMock.mockResolvedValue({ success: true });
  connectCalendarMock.mockResolvedValue(undefined);
  disconnectCalendarMock.mockResolvedValue(undefined);
  fetchTodayEventsMock.mockResolvedValue([liveEvent]);
  useCalendarStore.setState({
    connected: false,
    events: [],
    isLoading: false,
    error: null,
    lastSync: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('connect', () => {
  it('pulls live events via the Calendar service when available', async () => {
    isAvailableMock.mockReturnValue(true);

    await useCalendarStore.getState().connect();

    expect(connectCalendarMock).toHaveBeenCalledOnce();
    expect(fetchTodayEventsMock).toHaveBeenCalledOnce();
    const state = useCalendarStore.getState();
    expect(state.connected).toBe(true);
    expect(state.events).toEqual([liveEvent]);
    expect(successMock).toHaveBeenCalledWith('Google Calendar connected');
    expect(setCalendarStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ connected: true, events: [liveEvent] })
    );
  });

  it('falls back to sample data when the Calendar API is unavailable', async () => {
    isAvailableMock.mockReturnValue(false);

    await useCalendarStore.getState().connect();

    expect(connectCalendarMock).not.toHaveBeenCalled();
    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
    const state = useCalendarStore.getState();
    expect(state.connected).toBe(true);
    expect(state.events.length).toBeGreaterThan(0);
    expect(state.events[0].id).toBe('s1');
  });

  it('surfaces an error and stays disconnected when the live fetch fails', async () => {
    isAvailableMock.mockReturnValue(true);
    fetchTodayEventsMock.mockRejectedValue(new Error('boom'));

    await useCalendarStore.getState().connect();

    const state = useCalendarStore.getState();
    expect(state.connected).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Failed to connect calendar');
    expect(errorToastMock).toHaveBeenCalledWith('Failed to connect Google Calendar');
  });

  it('reports not-configured in a production build with no client id', async () => {
    isAvailableMock.mockReturnValue(false);
    vi.stubEnv('DEV', false);

    await useCalendarStore.getState().connect();

    const state = useCalendarStore.getState();
    expect(state.connected).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(errorToastMock).toHaveBeenCalledWith('Google Calendar is not set up in this build');
    expect(setCalendarStateMock).not.toHaveBeenCalled();
  });

  it('warns but stays connected when persisting the calendar state fails', async () => {
    isAvailableMock.mockReturnValue(true);
    setCalendarStateMock.mockResolvedValue({ success: false });

    await useCalendarStore.getState().connect();

    expect(useCalendarStore.getState().connected).toBe(true);
    expect(warningMock).toHaveBeenCalledWith('Connected, but saving calendar state failed');
    expect(successMock).not.toHaveBeenCalled();
  });
});

describe('refresh', () => {
  it('does nothing when not connected', async () => {
    isAvailableMock.mockReturnValue(true);

    await useCalendarStore.getState().refresh();

    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
  });

  it('re-fetches live events when connected', async () => {
    isAvailableMock.mockReturnValue(true);
    useCalendarStore.setState({ connected: true });

    await useCalendarStore.getState().refresh();

    expect(fetchTodayEventsMock).toHaveBeenCalledOnce();
    expect(useCalendarStore.getState().events).toEqual([liveEvent]);
  });

  it('surfaces an error when the live refresh fails', async () => {
    isAvailableMock.mockReturnValue(true);
    useCalendarStore.setState({ connected: true });
    fetchTodayEventsMock.mockRejectedValue(new Error('boom'));

    await useCalendarStore.getState().refresh();

    const state = useCalendarStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Failed to refresh calendar');
    expect(errorToastMock).toHaveBeenCalledWith('Failed to refresh Google Calendar');
  });
});

describe('initialize', () => {
  it('hydrates connected state from storage without refetching when synced today', async () => {
    const lastSync = new Date().toISOString();
    getCalendarStateMock.mockResolvedValue({ connected: true, events: [liveEvent], lastSync });

    await useCalendarStore.getState().initialize();

    const state = useCalendarStore.getState();
    expect(state.connected).toBe(true);
    expect(state.events).toEqual([liveEvent]);
    expect(state.lastSync).toBe(lastSync);
    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
  });

  it('refreshes when the cached events are from a previous day', async () => {
    isAvailableMock.mockReturnValue(true);
    getCalendarStateMock.mockResolvedValue({
      connected: true,
      events: [liveEvent],
      lastSync: '2020-01-01T00:00:00Z',
    });

    await useCalendarStore.getState().initialize();

    expect(fetchTodayEventsMock).toHaveBeenCalledOnce();
  });

  it('does not refresh a disconnected stored state', async () => {
    getCalendarStateMock.mockResolvedValue({
      connected: false,
      events: [],
      lastSync: '2020-01-01T00:00:00Z',
    });

    await useCalendarStore.getState().initialize();

    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
    expect(useCalendarStore.getState().connected).toBe(false);
  });

  it('leaves defaults when nothing is stored', async () => {
    getCalendarStateMock.mockResolvedValue(null);

    await useCalendarStore.getState().initialize();

    expect(useCalendarStore.getState().connected).toBe(false);
  });

  it('does not throw when loading state fails', async () => {
    getCalendarStateMock.mockRejectedValue(new Error('nope'));

    await expect(useCalendarStore.getState().initialize()).resolves.toBeUndefined();
    expect(useCalendarStore.getState().connected).toBe(false);
  });
});

describe('disconnect', () => {
  it('revokes the live token and clears state', async () => {
    isAvailableMock.mockReturnValue(true);
    useCalendarStore.setState({ connected: true, events: [liveEvent] });

    await useCalendarStore.getState().disconnect();

    expect(disconnectCalendarMock).toHaveBeenCalledOnce();
    const state = useCalendarStore.getState();
    expect(state.connected).toBe(false);
    expect(state.events).toEqual([]);
    expect(setCalendarStateMock).toHaveBeenCalledWith({
      connected: false,
      events: [],
      lastSync: null,
    });
  });

  it('skips token revocation in the dev fallback', async () => {
    isAvailableMock.mockReturnValue(false);
    useCalendarStore.setState({ connected: true });

    await useCalendarStore.getState().disconnect();

    expect(disconnectCalendarMock).not.toHaveBeenCalled();
    expect(useCalendarStore.getState().connected).toBe(false);
  });

  it('clears state and surfaces an error when persistence fails', async () => {
    isAvailableMock.mockReturnValue(true);
    setCalendarStateMock.mockResolvedValue({ success: false });
    useCalendarStore.setState({ connected: true, events: [liveEvent] });

    await useCalendarStore.getState().disconnect();

    expect(useCalendarStore.getState().connected).toBe(false);
    expect(errorToastMock).toHaveBeenCalledWith('Failed to disconnect calendar');
  });
});
