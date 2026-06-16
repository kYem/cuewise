import { type CalendarEvent, logger } from '@cuewise/shared';
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
  // Bumped on every connect/disconnect so an in-flight refresh can tell the
  // connection changed under it (disconnect, or disconnect→reconnect) and skip
  // its now-stale commit instead of resurrecting or clobbering the account.
  epoch: number;

  // Actions
  initialize: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  // `silent` suppresses failure toasts for background refreshes (e.g. on mount).
  refresh: (options?: { silent?: boolean }) => Promise<void>;
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  connected: false,
  events: [],
  isLoading: false,
  error: null,
  lastSync: null,
  epoch: 0,

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

  // Interactive consent, then pull today's events. Real connection only — there
  // is no sample/preview agenda, so the strip shows the Connect prompt until a
  // genuine connection succeeds. When unavailable (e.g. the Vite dev server,
  // which has no chrome.identity) it reports that rather than fabricating events.
  connect: async () => {
    if (!isCalendarAvailable()) {
      const message = 'Google Calendar is not available in the dev server';
      set({ error: message });
      useToastStore.getState().error(message);
      return;
    }
    set({ isLoading: true, error: null, epoch: get().epoch + 1 });
    const epoch = get().epoch;
    try {
      await connectCalendar();
      const events = await fetchTodayEvents();
      // The user may have disconnected while consent/fetch was in flight; don't
      // resurrect the connection they just cleared (same guard as refresh()).
      if (get().epoch !== epoch) {
        set({ isLoading: false });
        return;
      }
      const lastSync = new Date().toISOString();
      set({ connected: true, events, lastSync, isLoading: false });
      const result = await setCalendarState({ connected: true, events, lastSync });
      if (!result.success) {
        logger.error('Failed to persist calendar state', result.error);
        // Keep the working in-memory connection, but reflect the degraded state
        // so the strip's sync indicator isn't a misleading green.
        set({ error: 'Connected, but saving failed; may not persist after reload' });
        useToastStore.getState().warning('Connected, but saving calendar state failed');
        return;
      }
      useToastStore.getState().success('Google Calendar connected');
    } catch (error) {
      logger.error('Failed to connect calendar', error);
      set({ isLoading: false, error: 'Failed to connect calendar' });
      useToastStore.getState().error('Failed to connect Google Calendar');
    }
  },

  disconnect: async () => {
    // Bump first so any refresh already in flight skips its commit instead of
    // re-persisting connected:true after we clear it.
    set({ epoch: get().epoch + 1 });
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
    if (!get().connected || !isCalendarAvailable()) {
      return;
    }
    // Auto-refresh fires from several places (mount, minute tick, tab refocus);
    // skip if a fetch is already in flight so they don't stack duplicate calls.
    if (get().isLoading) {
      return;
    }
    const silent = options?.silent === true;
    const epoch = get().epoch;
    set({ isLoading: true, error: null });
    try {
      const events = await fetchTodayEvents();
      // The connection may have changed while the fetch was in flight — the user
      // disconnected, or disconnected then reconnected. Bail without committing
      // stale events or re-persisting connected:true.
      if (!get().connected || get().epoch !== epoch) {
        set({ isLoading: false });
        return;
      }
      const lastSync = new Date().toISOString();
      set({ events, lastSync, isLoading: false });
      const result = await setCalendarState({ connected: true, events, lastSync });
      if (!result.success) {
        logger.error('Failed to persist calendar state', result.error);
        // Reflect the degraded state on the sync indicator even on a silent
        // (background) refresh; cleared on the next successful refresh.
        set({ error: 'Refreshed, but saving failed; may not persist after reload' });
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
