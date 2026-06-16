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
  // Backstop: a nested describe enables fake timers; ensure real timers are
  // restored even if a test there throws before its own afterEach runs.
  vi.useRealTimers();
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

  it('stays disconnected and never fabricates events when unavailable', async () => {
    isAvailableMock.mockReturnValue(false);

    await useCalendarStore.getState().connect();

    expect(connectCalendarMock).not.toHaveBeenCalled();
    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
    const state = useCalendarStore.getState();
    expect(state.connected).toBe(false);
    expect(state.events).toEqual([]);
    expect(errorToastMock).toHaveBeenCalledWith(
      'Google Calendar is not available in the dev server'
    );
    expect(setCalendarStateMock).not.toHaveBeenCalled();
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

  it('surfaces an error and stays disconnected when consent is declined', async () => {
    isAvailableMock.mockReturnValue(true);
    connectCalendarMock.mockRejectedValue(new Error('Calendar permission was not granted'));

    await useCalendarStore.getState().connect();

    const state = useCalendarStore.getState();
    expect(state.connected).toBe(false);
    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
    expect(errorToastMock).toHaveBeenCalledWith('Failed to connect Google Calendar');
  });

  it('warns and flags a degraded state but stays connected when persisting fails', async () => {
    isAvailableMock.mockReturnValue(true);
    setCalendarStateMock.mockResolvedValue({ success: false });

    await useCalendarStore.getState().connect();

    expect(useCalendarStore.getState().connected).toBe(true);
    // error is set so the strip's sync indicator reflects the failed save.
    expect(useCalendarStore.getState().error).toBeTruthy();
    expect(warningMock).toHaveBeenCalledWith('Connected, but saving calendar state failed');
    expect(successMock).not.toHaveBeenCalled();
  });

  it('does not resurrect a connection disconnected during the handshake (epoch guard)', async () => {
    isAvailableMock.mockReturnValue(true);
    // Simulate the user disconnecting (epoch bump + connected:false) while the
    // post-consent fetch is still in flight.
    fetchTodayEventsMock.mockImplementation(async () => {
      useCalendarStore.setState((s) => ({ epoch: s.epoch + 1, connected: false }));
      return [liveEvent];
    });

    await useCalendarStore.getState().connect();

    const state = useCalendarStore.getState();
    expect(state.connected).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(setCalendarStateMock).not.toHaveBeenCalled();
    expect(successMock).not.toHaveBeenCalled();
  });
});

describe('refresh', () => {
  it('does nothing when not connected', async () => {
    isAvailableMock.mockReturnValue(true);

    await useCalendarStore.getState().refresh();

    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
  });

  it('does nothing when connected but the calendar is unavailable', async () => {
    isAvailableMock.mockReturnValue(false);
    useCalendarStore.setState({ connected: true });

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

  it('skips a concurrent refresh while one is already in flight', async () => {
    isAvailableMock.mockReturnValue(true);
    useCalendarStore.setState({ connected: true, isLoading: true });

    await useCalendarStore.getState().refresh();

    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
  });

  it('does not re-persist a connection that was disconnected mid-fetch', async () => {
    isAvailableMock.mockReturnValue(true);
    useCalendarStore.setState({ connected: true });
    // Simulate the user disconnecting while the fetch is in flight.
    fetchTodayEventsMock.mockImplementation(async () => {
      useCalendarStore.setState({ connected: false, events: [], lastSync: null });
      return [liveEvent];
    });

    await useCalendarStore.getState().refresh({ silent: true });

    expect(setCalendarStateMock).not.toHaveBeenCalled();
    const state = useCalendarStore.getState();
    expect(state.connected).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.events).toEqual([]);
  });

  it('discards a stale in-flight refresh after a reconnect (epoch guard)', async () => {
    isAvailableMock.mockReturnValue(true);
    useCalendarStore.setState({ connected: true });
    const reconnectedEvents: CalendarEvent[] = [{ ...liveEvent, id: 'reconnected' }];
    // Simulate disconnect→reconnect (epoch bumped, fresh events) while the
    // original fetch is still in flight; it resolves last with the old account.
    fetchTodayEventsMock.mockImplementation(async () => {
      useCalendarStore.setState((s) => ({
        epoch: s.epoch + 1,
        connected: true,
        events: reconnectedEvents,
      }));
      return [liveEvent];
    });

    await useCalendarStore.getState().refresh({ silent: true });

    expect(useCalendarStore.getState().events).toEqual(reconnectedEvents);
    expect(setCalendarStateMock).not.toHaveBeenCalled();
  });
});

describe('initialize', () => {
  // Fixed clock so the synced-today / previous-day boundary is deterministic.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00'));
    isAvailableMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates connected state from storage without refetching when synced today', async () => {
    const lastSync = new Date('2026-06-14T08:00:00').toISOString();
    getCalendarStateMock.mockResolvedValue({ connected: true, events: [liveEvent], lastSync });

    await useCalendarStore.getState().initialize();

    const state = useCalendarStore.getState();
    expect(state.connected).toBe(true);
    expect(state.events).toEqual([liveEvent]);
    expect(state.lastSync).toBe(lastSync);
    // isAvailable is true, so a regressed always-refresh would call this.
    expect(fetchTodayEventsMock).not.toHaveBeenCalled();
  });

  it('refreshes when the cached events are from the previous day', async () => {
    const lastSync = new Date('2026-06-13T20:00:00').toISOString();
    getCalendarStateMock.mockResolvedValue({ connected: true, events: [liveEvent], lastSync });

    await useCalendarStore.getState().initialize();

    expect(fetchTodayEventsMock).toHaveBeenCalledOnce();
  });

  it('refreshes when there is no prior sync timestamp', async () => {
    getCalendarStateMock.mockResolvedValue({ connected: true, events: [], lastSync: null });

    await useCalendarStore.getState().initialize();

    expect(fetchTodayEventsMock).toHaveBeenCalledOnce();
  });

  it('refreshes silently on mount — no error toast when the live fetch fails', async () => {
    fetchTodayEventsMock.mockRejectedValue(new Error('boom'));
    const lastSync = new Date('2026-06-13T20:00:00').toISOString();
    getCalendarStateMock.mockResolvedValue({ connected: true, events: [liveEvent], lastSync });

    await useCalendarStore.getState().initialize();

    expect(fetchTodayEventsMock).toHaveBeenCalledOnce();
    expect(errorToastMock).not.toHaveBeenCalled();
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

  it('clears local state even when token revocation throws', async () => {
    isAvailableMock.mockReturnValue(true);
    disconnectCalendarMock.mockRejectedValue(new Error('revoke failed'));
    useCalendarStore.setState({ connected: true, events: [liveEvent] });

    await useCalendarStore.getState().disconnect();

    const state = useCalendarStore.getState();
    expect(state.connected).toBe(false);
    expect(state.events).toEqual([]);
    expect(setCalendarStateMock).toHaveBeenCalledWith({
      connected: false,
      events: [],
      lastSync: null,
    });
    // Best-effort revoke failure must not surface as a disconnect error.
    expect(errorToastMock).not.toHaveBeenCalled();
  });
});
