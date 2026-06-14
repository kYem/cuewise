import { type CalendarEvent, getTodayDateString, logger } from '@cuewise/shared';
import { getCalendarState, setCalendarState } from '@cuewise/storage';
import { create } from 'zustand';
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

// Phase A placeholder agenda so the "Up next" UI is testable before the real
// Google Calendar OAuth lands. Times are anchored to today.
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

  // Phase A stub: loads sample events. Pass 2 replaces the internals with
  // chrome.identity.getAuthToken + a Google Calendar API fetch (UI unchanged).
  connect: async () => {
    set({ isLoading: true, error: null });
    try {
      const events = sampleEvents();
      const lastSync = new Date().toISOString();
      set({ connected: true, events, lastSync, isLoading: false });
      await setCalendarState({ connected: true, events, lastSync });
      useToastStore.getState().success('Calendar connected (sample data — live sync coming soon)');
    } catch (error) {
      logger.error('Failed to connect calendar', error);
      set({ isLoading: false, error: 'Failed to connect calendar' });
      useToastStore.getState().error('Failed to connect calendar');
    }
  },

  disconnect: async () => {
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
    const events = sampleEvents();
    const lastSync = new Date().toISOString();
    set({ events, lastSync, isLoading: false });
    await setCalendarState({ connected: true, events, lastSync });
  },
}));
