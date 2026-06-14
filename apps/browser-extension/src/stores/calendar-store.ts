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
  refresh: () => Promise<void>;
}

// Dev fallback agenda: chrome.identity doesn't exist in the Vite dev server,
// so connect/refresh fall back to this sample data when the API is unavailable.
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
      if (stored) {
        set({ connected: stored.connected, events: stored.events, lastSync: stored.lastSync });
      }
    } catch (error) {
      logger.error('Failed to load calendar state', error);
    }
  },

  // Interactive consent, then pull today's events. Falls back to sample data in
  // the dev server, where chrome.identity is absent.
  connect: async () => {
    set({ isLoading: true, error: null });
    try {
      const live = isCalendarAvailable();
      if (live) {
        await connectCalendar();
      }
      const events = live ? await fetchTodayEvents() : sampleEvents();
      const lastSync = new Date().toISOString();
      set({ connected: true, events, lastSync, isLoading: false });
      await setCalendarState({ connected: true, events, lastSync });
      const message = live
        ? 'Google Calendar connected'
        : 'Calendar connected (sample data — live sync needs the installed extension)';
      useToastStore.getState().success(message);
    } catch (error) {
      logger.error('Failed to connect calendar', error);
      set({ isLoading: false, error: 'Failed to connect calendar' });
      useToastStore.getState().error('Failed to connect Google Calendar');
    }
  },

  disconnect: async () => {
    if (isCalendarAvailable()) {
      await disconnectCalendar();
    }
    set({ connected: false, events: [], lastSync: null, error: null });
    try {
      await setCalendarState({ connected: false, events: [], lastSync: null });
    } catch (error) {
      logger.error('Failed to clear calendar state', error);
    }
  },

  refresh: async () => {
    if (!get().connected) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const events = isCalendarAvailable() ? await fetchTodayEvents() : sampleEvents();
      const lastSync = new Date().toISOString();
      set({ events, lastSync, isLoading: false });
      await setCalendarState({ connected: true, events, lastSync });
    } catch (error) {
      logger.error('Failed to refresh calendar', error);
      set({ isLoading: false, error: 'Failed to refresh calendar' });
      useToastStore.getState().error('Failed to refresh Google Calendar');
    }
  },
}));
