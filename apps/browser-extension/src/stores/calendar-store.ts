import { type CalendarEvent, getTodayDateString, logger } from '@cuewise/shared';
import { getCalendarState, setCalendarState } from '@cuewise/storage';
import { create } from 'zustand';
import {
  connectCalendar,
  disconnectCalendar,
  fetchTodayEvents,
  isCalendarAvailable,
} from '../utils/google-calendar';
import { useToastStore } from './toast-store';

interface CalendarStore {
  // State
  connected: boolean;
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  lastSync: string | null;

  // Actions
  initialize: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  // `silent` suppresses failure toasts for background refreshes (e.g. on mount).
  refresh: (options?: { silent?: boolean }) => Promise<void>;
}

// Dev-only fallback agenda: chrome.identity doesn't exist in the Vite dev
// server, so connect/refresh use this sample data there. Gated behind DEV so a
// production build never presents fabricated events as a real schedule.
// Times are anchored to today.
function sampleEvents(): CalendarEvent[] {
  const today = getTodayDateString();
  const at = (hhmm: string) => `${today}T${hhmm}:00`;
  return [
    {
      id: 's1',
      title: 'Daily standup',
      start: at('09:00'),
      end: at('09:15'),
      allDay: false,
      color: '#3b82f6',
    },
    {
      id: 's2',
      title: 'Design review',
      start: at('10:30'),
      end: at('11:30'),
      allDay: false,
      color: '#8b5cf6',
    },
    {
      id: 's3',
      title: 'Focus block · design system',
      start: at('13:00'),
      end: at('14:30'),
      allDay: false,
      color: '#22c55e',
    },
    {
      id: 's4',
      title: '1:1 with Sam',
      start: at('15:30'),
      end: at('16:00'),
      allDay: false,
      color: '#eab308',
    },
    {
      id: 's5',
      title: 'Wind down & plan tomorrow',
      start: at('17:00'),
      end: at('17:30'),
      allDay: false,
      color: '#14b8a6',
    },
  ];
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  connected: false,
  events: [],
  isLoading: false,
  error: null,
  lastSync: null,

  initialize: async () => {
    try {
      const stored = await getCalendarState();
      if (!stored) {
        return;
      }
      set({ connected: stored.connected, events: stored.events, lastSync: stored.lastSync });
      // Cached events can be from a previous day; refetch when connected and the
      // last sync wasn't today so the strip shows the current agenda, not stale one.
      const syncedToday =
        stored.lastSync !== null &&
        new Date(stored.lastSync).toDateString() === new Date().toDateString();
      if (stored.connected && !syncedToday) {
        // Background refresh — a failure here logs but must not toast on mount.
        await get().refresh({ silent: true });
      }
    } catch (error) {
      logger.error('Failed to load calendar state', error);
    }
  },

  // Interactive consent, then pull today's events. In the dev server (no
  // chrome.identity) this uses sample data; a production build without a
  // configured OAuth client id reports that the feature isn't set up rather
  // than faking a connection.
  connect: async () => {
    set({ isLoading: true, error: null });
    try {
      const live = isCalendarAvailable();
      let events: CalendarEvent[];
      if (live) {
        await connectCalendar();
        events = await fetchTodayEvents();
      } else if (import.meta.env.DEV) {
        events = sampleEvents();
      } else {
        set({ isLoading: false, error: 'Google Calendar is not configured in this build' });
        useToastStore.getState().error('Google Calendar is not set up in this build');
        return;
      }
      const lastSync = new Date().toISOString();
      set({ connected: true, events, lastSync, isLoading: false });
      const result = await setCalendarState({ connected: true, events, lastSync });
      if (!result.success) {
        logger.error('Failed to persist calendar state', result.error);
        useToastStore.getState().warning('Connected, but saving calendar state failed');
        return;
      }
      const message = live
        ? 'Google Calendar connected'
        : 'Calendar connected (sample data — dev only)';
      useToastStore.getState().success(message);
    } catch (error) {
      logger.error('Failed to connect calendar', error);
      set({ isLoading: false, error: 'Failed to connect calendar' });
      useToastStore.getState().error('Failed to connect Google Calendar');
    }
  },

  disconnect: async () => {
    // Best-effort token revocation must never block the local disconnect.
    try {
      if (isCalendarAvailable()) {
        await disconnectCalendar();
      }
    } catch (error) {
      logger.warn('Calendar token revocation failed', { error });
    }
    set({ connected: false, events: [], lastSync: null, error: null });
    const result = await setCalendarState({ connected: false, events: [], lastSync: null });
    if (!result.success) {
      logger.error('Failed to clear calendar state', result.error);
      useToastStore.getState().error('Failed to disconnect calendar');
    }
  },

  refresh: async (options) => {
    if (!get().connected) {
      return;
    }
    const silent = options?.silent === true;
    set({ isLoading: true, error: null });
    try {
      let events: CalendarEvent[];
      if (isCalendarAvailable()) {
        events = await fetchTodayEvents();
      } else if (import.meta.env.DEV) {
        events = sampleEvents();
      } else {
        set({ isLoading: false });
        return;
      }
      const lastSync = new Date().toISOString();
      set({ events, lastSync, isLoading: false });
      const result = await setCalendarState({ connected: true, events, lastSync });
      if (!result.success) {
        logger.error('Failed to persist calendar state', result.error);
        if (!silent) {
          useToastStore.getState().warning('Refreshed, but saving calendar state failed');
        }
      }
    } catch (error) {
      logger.error('Failed to refresh calendar', error);
      set({ isLoading: false, error: 'Failed to refresh calendar' });
      if (!silent) {
        useToastStore.getState().error('Failed to refresh Google Calendar');
      }
    }
  },
}));
