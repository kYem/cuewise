import * as storage from '@cuewise/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as weatherApi from '../utils/weather';
import {
  deferred,
  forecast,
  freshState,
  LONDON,
  snapshot,
  staleState,
  VILNIUS,
} from './__fixtures__/weather-store.fixtures';
import { useWeatherStore } from './weather-store';

vi.mock('@cuewise/storage', () => ({
  getWeatherState: vi.fn(),
  setWeatherState: vi.fn(),
}));

vi.mock('../utils/weather', async () => {
  const actual = await vi.importActual<typeof weatherApi>('../utils/weather');
  return {
    ...actual,
    fetchForecast: vi.fn(),
    searchLocations: vi.fn(),
  };
});

const errorToastMock = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({ success: vi.fn(), warning: vi.fn(), error: errorToastMock }),
  },
}));

const getWeatherStateMock = vi.mocked(storage.getWeatherState);
const setWeatherStateMock = vi.mocked(storage.setWeatherState);
const fetchForecastMock = vi.mocked(weatherApi.fetchForecast);
const searchLocationsMock = vi.mocked(weatherApi.searchLocations);

function resetStore(): void {
  useWeatherStore.setState({
    location: null,
    snapshot: null,
    isLoading: false,
    error: null,
    lastFetch: null,
    searchResults: [],
    isSearching: false,
    searchError: null,
    epoch: 0,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  getWeatherStateMock.mockResolvedValue(null);
  setWeatherStateMock.mockResolvedValue({ success: true });
  fetchForecastMock.mockResolvedValue(forecast());
  searchLocationsMock.mockResolvedValue([LONDON]);
});

describe('initialize', () => {
  it('does nothing when no weather state has been stored', async () => {
    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().location).toBeNull();
    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  it('restores the stored location and reading', async () => {
    getWeatherStateMock.mockResolvedValue(freshState());

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().location).toEqual(LONDON);
    expect(useWeatherStore.getState().snapshot).not.toBeNull();
  });

  it('does not refetch a reading that is still fresh', async () => {
    getWeatherStateMock.mockResolvedValue(freshState());

    await useWeatherStore.getState().initialize();

    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  it('refetches a stale reading', async () => {
    getWeatherStateMock.mockResolvedValue(staleState());

    await useWeatherStore.getState().initialize();

    expect(fetchForecastMock).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when a location was never chosen', async () => {
    getWeatherStateMock.mockResolvedValue({ location: null, snapshot: null, lastFetch: null });

    await useWeatherStore.getState().initialize();

    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  it('never toasts when the mount refresh fails', async () => {
    getWeatherStateMock.mockResolvedValue(staleState());
    fetchForecastMock.mockRejectedValue(new weatherApi.WeatherUnavailableError());

    await useWeatherStore.getState().initialize();

    expect(errorToastMock).not.toHaveBeenCalled();
    expect(useWeatherStore.getState().error).not.toBeNull();
  });

  it('survives a storage read failure without throwing', async () => {
    getWeatherStateMock.mockRejectedValue(new Error('storage exploded'));

    await expect(useWeatherStore.getState().initialize()).resolves.toBeUndefined();
    expect(useWeatherStore.getState().location).toBeNull();
  });
});

describe('setLocation', () => {
  it('stores the location and fetches a reading for it', async () => {
    await useWeatherStore.getState().setLocation(LONDON);

    expect(useWeatherStore.getState().location).toEqual(LONDON);
    expect(fetchForecastMock).toHaveBeenCalledWith(LONDON, 'metric');
    expect(useWeatherStore.getState().snapshot).not.toBeNull();
  });

  it('drops the previous reading immediately rather than showing it under the new place', async () => {
    useWeatherStore.setState({ location: LONDON, snapshot: snapshot(LONDON) });
    const pending = deferred<ReturnType<typeof forecast>>();
    fetchForecastMock.mockReturnValue(pending.promise);

    const inFlight = useWeatherStore.getState().setLocation(VILNIUS);

    expect(useWeatherStore.getState().snapshot).toBeNull();
    pending.release(forecast());
    await inFlight;
  });

  it('clears any lingering search results', async () => {
    useWeatherStore.setState({ searchResults: [LONDON, VILNIUS] });

    await useWeatherStore.getState().setLocation(VILNIUS);

    expect(useWeatherStore.getState().searchResults).toEqual([]);
  });
});

describe('clearLocation', () => {
  it('clears the location, reading and persisted state', async () => {
    useWeatherStore.setState({ location: LONDON, snapshot: snapshot(), lastFetch: 'x' });

    await useWeatherStore.getState().clearLocation();

    expect(useWeatherStore.getState().location).toBeNull();
    expect(useWeatherStore.getState().snapshot).toBeNull();
    expect(setWeatherStateMock).toHaveBeenCalledWith({
      location: null,
      snapshot: null,
      lastFetch: null,
    });
  });
});

describe('refresh', () => {
  it('does nothing without a location', async () => {
    await useWeatherStore.getState().refresh();

    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  it('skips when a refresh is already in flight', async () => {
    useWeatherStore.setState({ location: LONDON, isLoading: true });

    await useWeatherStore.getState().refresh();

    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  it('honours an explicit units preference', async () => {
    useWeatherStore.setState({ location: LONDON });

    await useWeatherStore.getState().refresh({ unitsPreference: 'imperial' });

    expect(fetchForecastMock).toHaveBeenCalledWith(LONDON, 'imperial');
  });

  it('toasts a user-initiated failure', async () => {
    useWeatherStore.setState({ location: LONDON });
    fetchForecastMock.mockRejectedValue(new weatherApi.WeatherUnavailableError());

    await useWeatherStore.getState().refresh();

    expect(errorToastMock).toHaveBeenCalledTimes(1);
  });

  it('stays silent for a background failure', async () => {
    useWeatherStore.setState({ location: LONDON });
    fetchForecastMock.mockRejectedValue(new weatherApi.WeatherUnavailableError());

    await useWeatherStore.getState().refresh({ silent: true });

    expect(errorToastMock).not.toHaveBeenCalled();
  });

  it('keeps the cached reading when a refresh fails', async () => {
    const cached = snapshot();
    useWeatherStore.setState({ location: LONDON, snapshot: cached, lastFetch: 'earlier' });
    fetchForecastMock.mockRejectedValue(new weatherApi.WeatherUnavailableError());

    await useWeatherStore.getState().refresh({ silent: true });

    expect(useWeatherStore.getState().snapshot).toBe(cached);
    expect(useWeatherStore.getState().lastFetch).toBe('earlier');
  });

  it('names the failure so the UI can explain rate limiting specifically', async () => {
    useWeatherStore.setState({ location: LONDON });
    fetchForecastMock.mockRejectedValue(new weatherApi.WeatherRateLimitedError(30));

    await useWeatherStore.getState().refresh({ silent: true });

    expect(useWeatherStore.getState().error).toMatch(/too many/i);
  });

  it('clears a previous error after a successful refresh', async () => {
    useWeatherStore.setState({ location: LONDON, error: 'stale failure' });

    await useWeatherStore.getState().refresh();

    expect(useWeatherStore.getState().error).toBeNull();
  });

  it('discards a response whose location changed while it was in flight', async () => {
    useWeatherStore.setState({ location: LONDON });
    const pending = deferred<ReturnType<typeof forecast>>();
    fetchForecastMock.mockReturnValueOnce(pending.promise);

    const stale = useWeatherStore.getState().refresh();
    useWeatherStore.setState({ location: VILNIUS, epoch: useWeatherStore.getState().epoch + 1 });
    pending.release(forecast());
    await stale;

    expect(useWeatherStore.getState().snapshot).toBeNull();
    expect(setWeatherStateMock).not.toHaveBeenCalled();
  });

  it('discards a failure whose location changed while it was in flight', async () => {
    useWeatherStore.setState({ location: LONDON });
    let reject: (error: Error) => void = () => {};
    fetchForecastMock.mockReturnValueOnce(
      new Promise((_resolve, rejectFn) => {
        reject = rejectFn;
      })
    );

    const stale = useWeatherStore.getState().refresh();
    useWeatherStore.setState({ location: VILNIUS, epoch: useWeatherStore.getState().epoch + 1 });
    reject(new weatherApi.WeatherUnavailableError());
    await stale;

    expect(useWeatherStore.getState().error).toBeNull();
    expect(errorToastMock).not.toHaveBeenCalled();
  });

  it('attaches the location to the stored snapshot', async () => {
    useWeatherStore.setState({ location: VILNIUS });

    await useWeatherStore.getState().refresh();

    expect(useWeatherStore.getState().snapshot?.location).toEqual(VILNIUS);
  });
});

describe('search', () => {
  it('returns results for a query', async () => {
    await useWeatherStore.getState().search('lond');

    expect(useWeatherStore.getState().searchResults).toEqual([LONDON]);
    expect(useWeatherStore.getState().isSearching).toBe(false);
  });

  it('clears results for an empty query without calling the API', async () => {
    useWeatherStore.setState({ searchResults: [LONDON] });

    await useWeatherStore.getState().search('   ');

    expect(useWeatherStore.getState().searchResults).toEqual([]);
    expect(searchLocationsMock).not.toHaveBeenCalled();
  });

  it('reports a search failure without touching the current reading', async () => {
    const cached = snapshot();
    useWeatherStore.setState({ snapshot: cached });
    searchLocationsMock.mockRejectedValue(new weatherApi.WeatherUnavailableError());

    await useWeatherStore.getState().search('lond');

    expect(useWeatherStore.getState().searchError).not.toBeNull();
    expect(useWeatherStore.getState().snapshot).toBe(cached);
  });

  it('ignores a slow earlier search that resolves after a newer one', async () => {
    const slow = deferred<(typeof LONDON)[]>();
    searchLocationsMock.mockReturnValueOnce(slow.promise);
    searchLocationsMock.mockResolvedValueOnce([VILNIUS]);

    const first = useWeatherStore.getState().search('lon');
    await useWeatherStore.getState().search('vil');
    slow.release([LONDON]);
    await first;

    expect(useWeatherStore.getState().searchResults).toEqual([VILNIUS]);
  });

  it('clearSearch invalidates an in-flight lookup', async () => {
    const slow = deferred<(typeof LONDON)[]>();
    searchLocationsMock.mockReturnValueOnce(slow.promise);

    const pending = useWeatherStore.getState().search('lon');
    useWeatherStore.getState().clearSearch();
    slow.release([LONDON]);
    await pending;

    expect(useWeatherStore.getState().searchResults).toEqual([]);
  });
});
