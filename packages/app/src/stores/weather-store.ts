import {
  logger,
  resolveWeatherUnits,
  type WeatherLocation,
  type WeatherSnapshot,
  type WeatherUnitsPreference,
} from '@cuewise/shared';
import { getWeatherState, setWeatherState } from '@cuewise/storage';
import { create } from 'zustand';
import {
  fetchForecast,
  searchLocations,
  WeatherRateLimitedError,
  WeatherUnavailableError,
} from '../utils/weather';
import { useToastStore } from './toast-store';

/** A reading older than this is refetched on mount. */
export const WEATHER_STALE_MS = 30 * 60 * 1000;

// Typing "lond" issues overlapping lookups; the slower earlier one must not land on top
// of the newer results.
let searchGeneration = 0;

interface WeatherStore {
  // State
  location: WeatherLocation | null;
  snapshot: WeatherSnapshot | null;
  isLoading: boolean;
  error: string | null;
  lastFetch: string | null;
  // Its own sub-state so a slow lookup never blocks or clobbers the reading.
  searchResults: WeatherLocation[];
  isSearching: boolean;
  searchError: string | null;
  // Bumped on every location change so an in-flight fetch can tell the place changed under
  // it and skip its now-stale commit. Same mechanism as calendar-store.
  epoch: number;

  // Actions
  initialize: () => Promise<void>;
  setLocation: (location: WeatherLocation) => Promise<void>;
  clearLocation: () => Promise<void>;
  refresh: (options?: {
    silent?: boolean;
    unitsPreference?: WeatherUnitsPreference;
  }) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
}

/** Logs but never toasts a write failure — the in-memory reading still works. */
async function persist(state: {
  location: WeatherLocation | null;
  snapshot: WeatherSnapshot | null;
  lastFetch: string | null;
}): Promise<void> {
  const result = await setWeatherState(state);
  if (!result.success) {
    logger.error('Failed to persist weather state', result.error);
  }
}

function messageFor(error: unknown): string {
  if (error instanceof WeatherRateLimitedError) {
    return 'Too many weather requests; try again in a moment';
  }
  if (error instanceof WeatherUnavailableError) {
    return 'The weather service is unavailable right now';
  }
  return 'Could not update the weather';
}

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  location: null,
  snapshot: null,
  isLoading: false,
  error: null,
  lastFetch: null,
  searchResults: [],
  isSearching: false,
  searchError: null,
  epoch: 0,

  initialize: async () => {
    try {
      const stored = await getWeatherState();
      if (stored === null) {
        return;
      }
      set({
        location: stored.location,
        snapshot: stored.snapshot,
        lastFetch: stored.lastFetch,
      });
      if (stored.location === null) {
        return;
      }
      const isStale =
        stored.lastFetch === null || Date.now() - Date.parse(stored.lastFetch) > WEATHER_STALE_MS;
      if (isStale) {
        // Silent: nobody who just opened a tab should be toasted at.
        await get().refresh({ silent: true });
      }
    } catch (error) {
      logger.error('Failed to load weather state', error);
    }
  },

  setLocation: async (location) => {
    // Bump first so any refresh already in flight for the previous place skips its commit.
    const epoch = get().epoch + 1;
    set({
      location,
      epoch,
      // Showing the old city's temperature under the new name, even for a frame, is worse
      // than a skeleton.
      snapshot: null,
      lastFetch: null,
      error: null,
      searchResults: [],
      searchError: null,
    });
    await persist({ location, snapshot: null, lastFetch: null });
    await get().refresh();
  },

  clearLocation: async () => {
    set({
      location: null,
      snapshot: null,
      lastFetch: null,
      error: null,
      epoch: get().epoch + 1,
      searchResults: [],
      searchError: null,
    });
    await persist({ location: null, snapshot: null, lastFetch: null });
  },

  refresh: async (options) => {
    const location = get().location;
    if (location === null) {
      return;
    }
    // Fires from mount, settings and the manual control; skip so they don't stack.
    if (get().isLoading) {
      return;
    }
    const silent = options?.silent === true;
    const epoch = get().epoch;
    const units = resolveWeatherUnits(options?.unitsPreference ?? 'auto');
    set({ isLoading: true, error: null });
    try {
      const forecast = await fetchForecast(location, units);
      if (get().epoch !== epoch) {
        set({ isLoading: false });
        return;
      }
      const snapshot: WeatherSnapshot = { ...forecast, location };
      const lastFetch = new Date().toISOString();
      set({ snapshot, lastFetch, isLoading: false });
      await persist({ location, snapshot, lastFetch });
    } catch (error) {
      logger.error('Failed to refresh weather', error);
      if (get().epoch !== epoch) {
        set({ isLoading: false });
        return;
      }
      // The cached snapshot deliberately survives: a 40-minute-old reading beats an error,
      // and the popover shows how old it is.
      set({ isLoading: false, error: messageFor(error) });
      if (!silent) {
        useToastStore.getState().error(messageFor(error));
      }
    }
  },

  search: async (query) => {
    const trimmed = query.trim();
    searchGeneration += 1;
    const generation = searchGeneration;
    if (trimmed === '') {
      set({ searchResults: [], isSearching: false, searchError: null });
      return;
    }
    set({ isSearching: true, searchError: null });
    try {
      const results = await searchLocations(trimmed);
      if (generation !== searchGeneration) {
        return;
      }
      set({ searchResults: results, isSearching: false });
    } catch (error) {
      logger.error('Failed to search weather locations', error);
      if (generation !== searchGeneration) {
        return;
      }
      set({ searchResults: [], isSearching: false, searchError: messageFor(error) });
    }
  },

  clearSearch: () => {
    // Invalidates any in-flight lookup, so closing the picker can't repopulate it.
    searchGeneration += 1;
    set({ searchResults: [], isSearching: false, searchError: null });
  },
}));
