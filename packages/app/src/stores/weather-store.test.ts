import { logger } from '@cuewise/shared';
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
  undatedState,
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
    inFlight: null,
    error: null,
    lastFetch: null,
    searchResults: [],
    isSearching: false,
    searchError: null,
    searchedFor: null,
    epoch: 0,
    initialized: false,
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

  it('reports itself initialized after restoring a stored location', async () => {
    getWeatherStateMock.mockResolvedValue(freshState());

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().initialized).toBe(true);
  });

  it('reports itself initialized when nothing was stored', async () => {
    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().initialized).toBe(true);
  });

  it('reports itself initialized after a failed read, so consumers are never left waiting', async () => {
    getWeatherStateMock.mockRejectedValue(new Error('storage unavailable'));

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().initialized).toBe(true);
  });

  it('discards a stored location the user cleared while the read was in flight', async () => {
    const pending = deferred<ReturnType<typeof freshState>>();
    getWeatherStateMock.mockReturnValueOnce(pending.promise);

    const stale = useWeatherStore.getState().initialize();
    await useWeatherStore.getState().clearLocation();
    pending.release(freshState());
    await stale;

    expect(useWeatherStore.getState().location).toBeNull();
    expect(useWeatherStore.getState().snapshot).toBeNull();
    expect(useWeatherStore.getState().initialized).toBe(true);
  });

  it('discards a stored location the user replaced while the read was in flight', async () => {
    const pending = deferred<ReturnType<typeof freshState>>();
    getWeatherStateMock.mockReturnValueOnce(pending.promise);

    const stale = useWeatherStore.getState().initialize();
    await useWeatherStore.getState().setLocation(VILNIUS);
    pending.release(freshState());
    await stale;

    expect(useWeatherStore.getState().location).toEqual(VILNIUS);
    expect(useWeatherStore.getState().snapshot?.location).toEqual(VILNIUS);
    expect(useWeatherStore.getState().initialized).toBe(true);
  });

  it('does not blame the shape for a read it discarded as stale', async () => {
    const logged = vi.spyOn(logger, 'error');
    const pending = deferred<ReturnType<typeof freshState>>();
    getWeatherStateMock.mockReturnValueOnce(pending.promise);

    const stale = useWeatherStore.getState().initialize();
    await useWeatherStore.getState().clearLocation();
    pending.release({ ...freshState(), snapshot: { ...snapshot(), current: undefined } } as never);
    await stale;

    expect(logged).not.toHaveBeenCalled();
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

  // The mount refresh used to hardcode 'auto', so an explicit °F setting silently
  // fetched °C on every new tab.
  it('honours the units preference on the mount refresh', async () => {
    getWeatherStateMock.mockResolvedValue(staleState());

    await useWeatherStore.getState().initialize('imperial');

    expect(fetchForecastMock).toHaveBeenCalledWith(LONDON, 'imperial');
  });

  it('does not fetch when a location was never chosen', async () => {
    const logged = vi.spyOn(logger, 'error');
    getWeatherStateMock.mockResolvedValue({ location: null, snapshot: null, lastFetch: null });

    await useWeatherStore.getState().initialize();

    expect(fetchForecastMock).not.toHaveBeenCalled();
    // The same blob `clearLocation` writes, so blaming it on a corrupt city would fire on
    // every tab of anyone who removed theirs.
    expect(logged).not.toHaveBeenCalled();
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
    await useWeatherStore.getState().setLocation(LONDON, 'metric');

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

  // Without this the in-flight guard eats the new location's fetch and the chip is
  // stuck on a skeleton until a reload.
  it('fetches the new place even while the previous one is still in flight', async () => {
    useWeatherStore.setState({ location: LONDON });
    const pending = deferred<ReturnType<typeof forecast>>();
    fetchForecastMock.mockReturnValueOnce(pending.promise);
    const stale = useWeatherStore.getState().refresh({ unitsPreference: 'metric' });

    await useWeatherStore.getState().setLocation(VILNIUS, 'metric');
    pending.release(forecast());
    await stale;

    expect(fetchForecastMock).toHaveBeenCalledTimes(2);
    expect(fetchForecastMock).toHaveBeenLastCalledWith(VILNIUS, 'metric');
    expect(useWeatherStore.getState().snapshot).not.toBeNull();
  });

  it('carries the units preference into the fetch it triggers', async () => {
    await useWeatherStore.getState().setLocation(VILNIUS, 'imperial');

    expect(fetchForecastMock).toHaveBeenCalledWith(VILNIUS, 'imperial');
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

  it('a failed removal warns the location may come back, not that it may be forgotten', async () => {
    useWeatherStore.setState({ location: LONDON, snapshot: snapshot(), lastFetch: 'x' });
    setWeatherStateMock.mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await useWeatherStore.getState().clearLocation();

    expect(errorToastMock).toHaveBeenCalledWith(
      'Could not remove your weather location; it may come back on your next tab'
    );
  });
});

describe('refresh', () => {
  it('does nothing without a location', async () => {
    await useWeatherStore.getState().refresh();

    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  it('skips when a refresh for the same place is already in flight', async () => {
    useWeatherStore.setState({
      location: LONDON,
      epoch: 0,
      inFlight: { id: 1, epoch: 0, units: 'metric' },
    });

    await useWeatherStore.getState().refresh({ unitsPreference: 'metric' });

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

    expect(useWeatherStore.getState().error).toMatch(/in about 30s/);
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

// The blob is read back on every new tab, so a shape the chip can't render would not fail
// once — it would take the whole page down through the app-wide ErrorBoundary, every open.
describe('a stored reading that no longer matches the shape', () => {
  it('is discarded rather than handed to the chip', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const broken = { ...freshState(), snapshot: { ...snapshot(), current: undefined } };
    getWeatherStateMock.mockResolvedValue(broken as never);
    // The discard triggers a refetch, which would otherwise land a valid reading and hide
    // whether the stored one was ever accepted.
    fetchForecastMock.mockRejectedValue(new Error('offline'));

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().snapshot).toBeNull();
    expect(useWeatherStore.getState().location).toEqual(LONDON);
    // error, not warn, or the reason never reaches a default install.
    expect(logged).toHaveBeenCalledWith('Discarded an unreadable stored weather reading');
    logged.mockRestore();
  });

  it('is refetched instead of leaving a permanent skeleton', async () => {
    const broken = { ...freshState(), snapshot: { ...snapshot(), hours: [null] } };
    getWeatherStateMock.mockResolvedValue(broken as never);

    await useWeatherStore.getState().initialize();

    // freshState's timestamp would normally suppress the mount refresh.
    expect(fetchForecastMock).toHaveBeenCalledTimes(1);
  });

  // The location outlives any given reading, and the chip reads it directly, so a broken
  // one is the same hazard: no location renders nothing, a malformed one throws.
  it('discards a location that lost required fields', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { countryCode: _dropped, ...incomplete } = LONDON;
    getWeatherStateMock.mockResolvedValue({ ...freshState(), location: incomplete } as never);

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().location).toBeNull();
    expect(fetchForecastMock).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith('Discarded an unreadable stored weather location');
    logged.mockRestore();
  });

  // setLocation persists the city before the first fetch, so a reading that is simply not
  // there yet is ordinary — reporting it as discarded would cry corruption on every tab.
  it('stays quiet about the reading a freshly picked city has not fetched yet', async () => {
    const logged = vi.spyOn(logger, 'error');
    getWeatherStateMock.mockResolvedValue({
      location: LONDON,
      snapshot: null,
      lastFetch: null,
    } as never);

    await useWeatherStore.getState().initialize();

    expect(logged).not.toHaveBeenCalled();
  });

  it('keeps a reading that is merely missing an optional field', async () => {
    const reading = snapshot();
    const withoutApparent = {
      ...freshState(),
      snapshot: { ...reading, current: { ...reading.current, apparentTemperature: null } },
    };
    getWeatherStateMock.mockResolvedValue(withoutApparent);

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().snapshot).not.toBeNull();
  });
});

// Every one of these was a green mutation before it existed: the mechanism could be
// deleted outright and the suite stayed passing.
describe('what a refresh actually persists', () => {
  it('writes the reading, so the next tab does not refetch it', async () => {
    useWeatherStore.setState({ location: LONDON });

    await useWeatherStore.getState().refresh({ unitsPreference: 'metric' });

    expect(setWeatherStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        location: LONDON,
        snapshot: expect.objectContaining({ units: 'metric' }),
      })
    );
  });

  it('stamps the reading with the time it landed', async () => {
    useWeatherStore.setState({ location: LONDON });

    await useWeatherStore.getState().refresh({ unitsPreference: 'metric' });

    // Parseable, not merely present: initialize's own guard discards a stamp it cannot
    // read, which would make every tab refetch forever.
    expect(Date.parse(useWeatherStore.getState().lastFetch ?? '')).not.toBeNaN();
  });

  it('warns rather than pretending a failed write succeeded', async () => {
    const quotaError = { type: 'quota_exceeded' as const, message: 'Storage is full' };
    setWeatherStateMock.mockResolvedValue({ success: false, error: quotaError });
    useWeatherStore.setState({ location: LONDON });
    const logged = vi.spyOn(logger, 'error');

    await useWeatherStore.getState().refresh({ unitsPreference: 'metric' });

    expect(logged).toHaveBeenCalledWith('Failed to persist weather reading', quotaError);
  });

  it('tells the user when the location itself could not be saved', async () => {
    setWeatherStateMock.mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'Storage is full' },
    });

    await useWeatherStore.getState().setLocation(LONDON, 'metric');

    expect(errorToastMock).toHaveBeenCalledWith(expect.stringContaining('Could not save'));
  });
});

describe('overlapping refreshes', () => {
  it('lets a units change through while a fetch for the same place is running', async () => {
    useWeatherStore.setState({ location: LONDON, inFlight: { id: 99, epoch: 0, units: 'metric' } });

    await useWeatherStore.getState().refresh({ unitsPreference: 'imperial' });

    expect(fetchForecastMock).toHaveBeenCalledTimes(1);
  });

  it('does not let a superseded fetch clear the live one loading state', async () => {
    const first = deferred<ReturnType<typeof forecast>>();
    const second = deferred<ReturnType<typeof forecast>>();
    fetchForecastMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    useWeatherStore.setState({ location: LONDON });

    const a = useWeatherStore.getState().refresh({ unitsPreference: 'metric' });
    const b = useWeatherStore.getState().refresh({ unitsPreference: 'imperial' });
    first.release(forecast());
    await a;

    expect(useWeatherStore.getState().inFlight).not.toBeNull();
    second.release(forecast({ units: 'imperial' }));
    await b;
  });

  // The earlier request is still real data; discarding it left a dead-end error chip with
  // nothing to retrigger it.
  it('keeps a reading that lands after a later request already failed', async () => {
    const slow = deferred<ReturnType<typeof forecast>>();
    fetchForecastMock
      .mockReturnValueOnce(slow.promise)
      .mockRejectedValueOnce(new Error('rate limited'));
    useWeatherStore.setState({ location: LONDON });

    const a = useWeatherStore.getState().refresh({ unitsPreference: 'metric' });
    await useWeatherStore.getState().refresh({ silent: true, unitsPreference: 'imperial' });
    slow.release(forecast());
    await a;

    expect(useWeatherStore.getState().snapshot).not.toBeNull();
  });
});

describe('a stored timestamp that cannot be read', () => {
  // An unreadable stamp reads stale to nothing — neither the check at mount nor the widget's
  // own timer — so a reading kept beside it would never refresh again.
  it('is treated as no timestamp at all, so the reading refreshes', async () => {
    getWeatherStateMock.mockResolvedValue(undatedState() as never);

    await useWeatherStore.getState().initialize();

    expect(fetchForecastMock).toHaveBeenCalledTimes(1);
  });

  it('takes the reading down with it rather than showing it as current', async () => {
    getWeatherStateMock.mockResolvedValue(undatedState() as never);
    // Without the rejection the refetch lands and puts a snapshot straight back.
    fetchForecastMock.mockRejectedValueOnce(new weatherApi.WeatherUnavailableError());

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().snapshot).toBeNull();
    expect(useWeatherStore.getState().location).toEqual(LONDON);
  });

  it('says which value it could not use', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    getWeatherStateMock.mockResolvedValue(undatedState() as never);

    await useWeatherStore.getState().initialize();

    expect(errorSpy).toHaveBeenCalledWith(
      'Discarded a stored weather reading with an unusable timestamp',
      { lastFetch: 'whenever' }
    );
    errorSpy.mockRestore();
  });

  it('keeps a stamp a few seconds ahead, which is our own clock stepping back', async () => {
    const barelyAhead = new Date(Date.now() + 10_000).toISOString();
    getWeatherStateMock.mockResolvedValue({ ...freshState(), lastFetch: barelyAhead } as never);

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().snapshot).not.toBeNull();
    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  // A clock set forward when the reading was written, then corrected: every staleness check
  // subtracts it from now, so it would read as fresh for as long as the skew lasts.
  it('drops a stamp from the future, which would otherwise never age out', async () => {
    const ahead = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    getWeatherStateMock.mockResolvedValue({ ...freshState(), lastFetch: ahead } as never);
    fetchForecastMock.mockRejectedValueOnce(new weatherApi.WeatherUnavailableError());

    await useWeatherStore.getState().initialize();

    expect(useWeatherStore.getState().snapshot).toBeNull();
    expect(fetchForecastMock).toHaveBeenCalledTimes(1);
  });
});

describe('an error left behind by a concurrent request', () => {
  // A stale failure line beside a reading fetched seconds ago reads as "this data is
  // broken" when it is current.
  it('is cleared by the reading that lands afterwards', async () => {
    const slow = deferred<ReturnType<typeof forecast>>();
    fetchForecastMock
      .mockReturnValueOnce(slow.promise)
      .mockRejectedValueOnce(new weatherApi.WeatherUnavailableError());
    useWeatherStore.setState({ location: LONDON });

    const a = useWeatherStore.getState().refresh({ unitsPreference: 'metric' });
    await useWeatherStore.getState().refresh({ silent: true, unitsPreference: 'imperial' });
    expect(useWeatherStore.getState().error).not.toBeNull();

    slow.release(forecast());
    await a;

    expect(useWeatherStore.getState().error).toBeNull();
  });

  // The mirror case: a request that was superseded must not write its error over the
  // state of the one that replaced it.
  it('is never written by a request that has already been superseded', async () => {
    const doomed = deferred<ReturnType<typeof forecast>>();
    const live = deferred<ReturnType<typeof forecast>>();
    fetchForecastMock.mockReturnValueOnce(doomed.promise).mockReturnValueOnce(live.promise);
    useWeatherStore.setState({ location: LONDON });

    const a = useWeatherStore.getState().refresh({ silent: true, unitsPreference: 'metric' });
    const b = useWeatherStore.getState().refresh({ silent: true, unitsPreference: 'imperial' });
    doomed.release(Promise.reject(new Error('too late')) as never);
    await a.catch(() => undefined);

    expect(useWeatherStore.getState().error).toBeNull();
    live.release(forecast({ units: 'imperial' }));
    await b;
  });
});

describe('which reading wins', () => {
  // The baseline is what landed; the comparison key is issue order. A reply issued earlier
  // but answered last must not overwrite the newer one, or the chip silently reverts to
  // the scale the user just left.
  it('keeps the newer reading when an older request answers last', async () => {
    const slow = deferred<ReturnType<typeof forecast>>();
    const fast = deferred<ReturnType<typeof forecast>>();
    fetchForecastMock.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    useWeatherStore.setState({ location: LONDON });

    const a = useWeatherStore.getState().refresh({ silent: true, unitsPreference: 'metric' });
    const b = useWeatherStore.getState().refresh({ silent: true, unitsPreference: 'imperial' });
    fast.release(forecast({ units: 'imperial' }));
    await b;
    slow.release(forecast({ units: 'metric' }));
    await a;

    expect(useWeatherStore.getState().snapshot?.units).toBe('imperial');
  });
});

describe('search bookkeeping', () => {
  it('records the query its results belong to', async () => {
    await useWeatherStore.getState().search('  lond  ');

    expect(useWeatherStore.getState().searchedFor).toBe('lond');
  });

  it('forgets it when the lookup fails, so no empty state is claimed', async () => {
    // Seeded, or the assertion is null-stays-null and the clearing can be deleted.
    useWeatherStore.setState({ searchedFor: 'lon', searchResults: [LONDON] });
    searchLocationsMock.mockRejectedValue(new weatherApi.WeatherUnavailableError());

    await useWeatherStore.getState().search('lond');

    expect(useWeatherStore.getState().searchedFor).toBeNull();
  });
});
