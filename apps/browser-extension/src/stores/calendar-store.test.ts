import type { CalendarEvent } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const errorToastMock = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({ success: successMock, warning: vi.fn(), error: errorToastMock }),
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
});
