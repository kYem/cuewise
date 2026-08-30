import {
  logger,
  resolveWeatherUnits,
  WEATHER_STALE_MS,
  type WeatherLocation,
  type WeatherSnapshot,
  type WeatherState,
  type WeatherUnits,
  type WeatherUnitsPreference,
  weatherAgeMs,
} from '@cuewise/shared';
import { getWeatherState, setWeatherState } from '@cuewise/storage';
import { create } from 'zustand';
import {
  fetchForecast,
  isWeatherLocation,
  isWeatherSnapshot,
  searchLocations,
  WeatherRateLimitedError,
  WeatherRequestError,
  WeatherUnavailableError,
} from '../utils/weather';
import { useToastStore } from './toast-store';

// Typing "lond" issues overlapping lookups; the slower earlier one must not land on top
// of the newer results.
let searchGeneration = 0;

// Two monotonic milestones. A failure measures itself against the newest request *started*
// — a superseded error is noise. A reading measures itself against the newest that actually
// *landed*: being outrun by a request that then failed is no reason to throw real data away
// for a dead-end error chip.
let lastStartedId = 0;
let lastLandedId = 0;

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
  // The query the results in `searchResults` belong to, or null when none have landed.
  searchedFor: string | null;
  // Bumped on every location change so an in-flight fetch can tell the place changed under
  // it and skip its now-stale commit. Same mechanism as calendar-store.
  epoch: number;
  // A null `location` alone cannot tell "no city saved" from "storage not read yet", so a
  // consumer deciding what to show on that basis has to wait for this.
  initialized: boolean;

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

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && weatherAgeMs(value) !== null;
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
    // A failed removal means the old city stays on disk — the opposite of "forgotten".
    const message =
      state.location === null
        ? 'Could not remove your weather location; it may come back on your next tab'
        : 'Could not save your weather location; it may be forgotten when you close this tab';
    useToastStore.getState().error(message);
  }
}

/** A failed city lookup must not be reported as a failed weather reading. */
function messageFor(error: unknown, context: 'forecast' | 'search'): string {
  if (error instanceof WeatherRateLimitedError) {
    const wait = error.retryAfterSeconds;
    if (wait !== null && wait > 0) {
      return `Too many requests; try again in about ${Math.ceil(wait)}s`;
    }
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

/** A null location only means "no city" once the read has happened — before that it means nothing. */
export function needsWeatherCity(state: Pick<WeatherStore, 'location' | 'initialized'>): boolean {
  return state.initialized && state.location === null;
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
  searchedFor: null,
  epoch: 0,
  initialized: false,

  initialize: async (unitsPreference) => {
    // Re-runs whenever weather is switched back on, and the city control stays mounted
    // beside that switch, so a clear or a pick can land while this read is in flight.
    const epoch = get().epoch;
    // Only the read is guarded. Both storage adapters already answer null rather than
    // throwing, so anything caught here would be a bug of ours — and wrapping the rest
    // would turn that bug into a widget that silently does not exist, on every tab.
    let stored: WeatherState | null;
    try {
      stored = await getWeatherState();
    } catch (error) {
      logger.error('Failed to load weather state', error);
      set({ initialized: true });
      return;
    }
    // A clear or a pick landed while this read was in flight, so everything it carries is
    // stale — including the discards below, which would blame the wrong thing.
    if (get().epoch !== epoch) {
      set({ initialized: true });
      return;
    }
    if (stored === null) {
      set({ initialized: true });
      return;
    }
    // error, not warn, on every discard below: the shipped logLevel is 'error', and a city
    // or a reading disappearing is where an "it forgot my weather" report starts.
    const placed = isWeatherLocation(stored.location);
    const location = placed ? stored.location : null;
    if (stored.location !== null && !placed) {
      logger.error('Discarded an unreadable stored weather location');
    }

    const readable = isWeatherSnapshot(stored.snapshot);
    const dated = isTimestamp(stored.lastFetch);
    // Kept only while it is readable, dated, and still has the city it describes: undated it
    // shows no age, and orphaned it arms a refresh that returns the moment it sees no city.
    const usable = readable && dated && location !== null;
    const snapshot = usable ? stored.snapshot : null;
    const lastFetch = usable ? stored.lastFetch : null;
    if (stored.snapshot !== null && !readable) {
      logger.error('Discarded an unreadable stored weather reading');
    }
    if (readable && !dated) {
      logger.error('Discarded a stored weather reading with an unusable timestamp', {
        lastFetch: stored.lastFetch,
      });
    }
    set({ location, snapshot, lastFetch, initialized: true });
    if (location === null) {
      return;
    }
    const age = weatherAgeMs(lastFetch);
    const isStale = age === null || age > WEATHER_STALE_MS;
    if (isStale) {
      await get().refresh({ silent: true, unitsPreference });
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
      searchedFor: null,
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
      searchedFor: null,
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
    lastStartedId += 1;
    const id = lastStartedId;
    set({ inFlight: { id, epoch, units }, error: null });
    // The place must not have changed under this request; `clearLocation` bumps the epoch
    // without starting a fetch, so this is not implied by the id checks below.
    function samePlace(): boolean {
      return get().epoch === epoch;
    }
    try {
      const forecast = await fetchForecast(location, units);
      // Dropped only if a later-issued request already landed; one issued earlier but
      // answered last is still fresher than nothing.
      if (!samePlace() || id < lastLandedId) {
        return;
      }
      lastLandedId = id;
      const snapshot: WeatherSnapshot = { ...forecast, location };
      const lastFetch = new Date().toISOString();
      // `error` is cleared here, not only when a request starts: a concurrent request that
      // failed may have written one, and the popover shows it above the age — so
      // fresh data would sit under a stale failure line with nothing to clear it.
      set({ snapshot, lastFetch, error: null });
      await persistReading({ location, snapshot, lastFetch });
    } catch (error) {
      logger.error('Failed to refresh weather', error, {
        status: error instanceof WeatherRequestError ? error.status : null,
        cause: error instanceof WeatherRequestError ? error.cause : null,
      });
      // A superseded request stays quiet: the newer one owns the outcome now, and this
      // error would otherwise land beside its reading.
      if (!samePlace() || id < lastStartedId) {
        return;
      }
      // The cached snapshot deliberately survives; the popover shows this above its age line.
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
      set({ searchResults: [], isSearching: false, searchError: null, searchedFor: null });
      return;
    }
    set({ isSearching: true, searchError: null });
    try {
      const results = await searchLocations(trimmed);
      if (generation !== searchGeneration) {
        return;
      }
      // `searchedFor` is what makes "no matches" distinguishable from "not asked yet":
      // without it the picker calls every half-typed city name unknown.
      set({ searchResults: results, isSearching: false, searchedFor: trimmed });
    } catch (error) {
      logger.error('Failed to search weather locations', error);
      if (generation !== searchGeneration) {
        return;
      }
      set({
        searchResults: [],
        isSearching: false,
        searchError: messageFor(error, 'search'),
        searchedFor: null,
      });
    }
  },

  clearSearch: () => {
    searchGeneration += 1;
    set({ searchResults: [], isSearching: false, searchError: null, searchedFor: null });
  },
}));
