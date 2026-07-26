import {
  logger,
  resolveWeatherUnits,
  type WeatherLocation,
  type WeatherSnapshot,
  type WeatherState,
  type WeatherUnits,
  type WeatherUnitsPreference,
} from '@cuewise/shared';
import { getWeatherState, setWeatherState } from '@cuewise/storage';
import { create } from 'zustand';
import {
  fetchForecast,
  isWeatherSnapshot,
  searchLocations,
  WeatherRateLimitedError,
  WeatherRequestError,
  WeatherUnavailableError,
} from '../utils/weather';
import { useToastStore } from './toast-store';

/** A reading older than this is refetched on mount. */
export const WEATHER_STALE_MS = 30 * 60 * 1000;

// Typing "lond" issues overlapping lookups; the slower earlier one must not land on top
// of the newer results.
let searchGeneration = 0;

// Monotonic, so a superseded fetch can be told apart from the one that replaced it even
// when both belong to the same location.
let requestCounter = 0;

interface WeatherStore {
  // State
  location: WeatherLocation | null;
  snapshot: WeatherSnapshot | null;
  // The request in progress, or null. Keyed by place AND units, because both can change
  // mid-flight: a boolean swallowed setLocation's fetch, and keying on place alone
  // swallowed a units change, pinning the chip to the old scale until remount.
  inFlight: { id: number; epoch: number; units: WeatherUnits } | null;
  error: string | null;
  lastFetch: string | null;
  searchResults: WeatherLocation[];
  isSearching: boolean;
  searchError: string | null;
  // Bumped on every location change so an in-flight fetch can tell the place changed under
  // it and skip its now-stale commit. Same mechanism as calendar-store.
  epoch: number;

  // Actions
  initialize: (unitsPreference?: WeatherUnitsPreference) => Promise<void>;
  setLocation: (
    location: WeatherLocation,
    unitsPreference?: WeatherUnitsPreference
  ) => Promise<void>;
  clearLocation: () => Promise<void>;
  refresh: (options?: {
    silent?: boolean;
    unitsPreference?: WeatherUnitsPreference;
  }) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
}

/** A lost cache entry only costs one extra fetch, so log and move on. */
async function persistReading(state: WeatherState): Promise<void> {
  const result = await setWeatherState(state);
  if (!result.success) {
    logger.error('Failed to persist weather reading', result.error);
  }
}

/**
 * The user asked for this, so a failed write must not look like it succeeded — otherwise
 * removing a location appears to work while the city stays on disk and returns next tab.
 */
async function persistLocation(state: WeatherState): Promise<void> {
  const result = await setWeatherState(state);
  if (!result.success) {
    logger.error('Failed to persist weather location', result.error);
    useToastStore
      .getState()
      .error('Could not save your weather location; it may be forgotten when you close this tab');
  }
}

/** A failed city lookup must not be reported as a failed weather reading. */
function messageFor(error: unknown, context: 'forecast' | 'search'): string {
  if (error instanceof WeatherRateLimitedError) {
    return 'Too many requests; try again in a moment';
  }
  if (error instanceof WeatherUnavailableError) {
    return context === 'search'
      ? 'The location service is unavailable right now'
      : 'The weather service is unavailable right now';
  }
  // Already phrased for a person — throwing it away loses the useful part.
  if (error instanceof WeatherRequestError) {
    return error.message;
  }
  return context === 'search' ? 'Could not search for places' : 'Could not update the weather';
}

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  location: null,
  snapshot: null,
  inFlight: null,
  error: null,
  lastFetch: null,
  searchResults: [],
  isSearching: false,
  searchError: null,
  epoch: 0,

  initialize: async (unitsPreference) => {
    try {
      const stored = await getWeatherState();
      if (stored === null) {
        return;
      }
      // Anything that no longer matches the shape is dropped rather than rendered. Its
      // `lastFetch` goes with it, so the staleness check below refetches instead of
      // leaving a permanent skeleton.
      const snapshot = isWeatherSnapshot(stored.snapshot) ? stored.snapshot : null;
      const lastFetch = snapshot === null ? null : stored.lastFetch;
      if (stored.snapshot !== null && snapshot === null) {
        logger.warn('Discarded an unreadable stored weather reading');
      }
      set({ location: stored.location, snapshot, lastFetch });
      if (stored.location === null) {
        return;
      }
      const isStale = lastFetch === null || Date.now() - Date.parse(lastFetch) > WEATHER_STALE_MS;
      if (isStale) {
        await get().refresh({ silent: true, unitsPreference });
      }
    } catch (error) {
      logger.error('Failed to load weather state', error);
    }
  },

  setLocation: async (location, unitsPreference) => {
    // Bump first so any refresh already in flight for the previous place skips its commit.
    const epoch = get().epoch + 1;
    set({
      location,
      epoch,
      snapshot: null,
      lastFetch: null,
      error: null,
      searchResults: [],
      searchError: null,
    });
    await persistLocation({ location, snapshot: null, lastFetch: null });
    await get().refresh({ unitsPreference });
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
    await persistLocation({ location: null, snapshot: null, lastFetch: null });
  },

  refresh: async (options) => {
    const location = get().location;
    if (location === null) {
      return;
    }
    const epoch = get().epoch;
    const silent = options?.silent === true;
    const units = resolveWeatherUnits(options?.unitsPreference ?? 'auto');
    const running = get().inFlight;
    // Only the identical request is redundant; a different place or scale must proceed.
    if (running !== null && running.epoch === epoch && running.units === units) {
      return;
    }
    requestCounter += 1;
    const id = requestCounter;
    set({ inFlight: { id, epoch, units }, error: null });
    // False once a newer request owns the result, whether the place or the scale changed.
    function ownsResult(): boolean {
      return get().epoch === epoch && get().inFlight?.id === id;
    }
    try {
      const forecast = await fetchForecast(location, units);
      if (!ownsResult()) {
        return;
      }
      const snapshot: WeatherSnapshot = { ...forecast, location };
      const lastFetch = new Date().toISOString();
      set({ snapshot, lastFetch });
      await persistReading({ location, snapshot, lastFetch });
    } catch (error) {
      logger.error('Failed to refresh weather', error);
      if (!ownsResult()) {
        return;
      }
      // The cached snapshot deliberately survives; the popover shows how old it is.
      const message = messageFor(error, 'forecast');
      set({ error: message });
      if (!silent) {
        useToastStore.getState().error(message);
      }
    } finally {
      // Only the request still owning the slot may release it — a superseded one must
      // not clear the newer request's loading state.
      if (get().inFlight?.id === id) {
        set({ inFlight: null });
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
      set({ searchResults: [], isSearching: false, searchError: messageFor(error, 'search') });
    }
  },

  clearSearch: () => {
    searchGeneration += 1;
    set({ searchResults: [], isSearching: false, searchError: null });
  },
}));
