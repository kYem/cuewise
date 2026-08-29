import {
  WEATHER_STALE_MS,
  type WeatherForecast,
  type WeatherHour,
  type WeatherLocation,
  type WeatherSnapshot,
  type WeatherState,
} from '@cuewise/shared';

export const LONDON: WeatherLocation = {
  id: '2643743',
  name: 'London',
  admin1: 'England',
  country: 'United Kingdom',
  countryCode: 'GB',
  latitude: 51.5074,
  longitude: -0.1278,
  timezone: 'Europe/London',
};

export const VILNIUS: WeatherLocation = {
  id: '593116',
  name: 'Vilnius',
  admin1: 'Vilnius',
  country: 'Lithuania',
  countryCode: 'LT',
  latitude: 54.68916,
  longitude: 25.2798,
  timezone: 'Europe/Vilnius',
};

export function hours(date = '2026-07-25'): WeatherHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature: 10 + hour * 0.5,
    condition: 'clear' as const,
    // London-ish daylight window, so the strip's day/night icons have something real to read.
    isDay: hour >= 6 && hour < 21,
  }));
}

export function forecast(overrides: Partial<WeatherForecast> = {}): WeatherForecast {
  return {
    units: 'metric',
    timezone: 'Europe/London',
    current: {
      temperature: 17,
      apparentTemperature: 15,
      condition: 'clear',
      isDay: true,
    },
    high: 21,
    low: 11,
    hours: hours(),
    ...overrides,
  };
}

export function snapshot(
  location: WeatherLocation = LONDON,
  overrides: Partial<WeatherForecast> = {}
): WeatherSnapshot {
  return { ...forecast(overrides), location };
}

/** A stored state with a reading fresh enough that initialize() must not refetch. */
export function freshState(now = Date.now()): WeatherState {
  return {
    location: LONDON,
    snapshot: snapshot(),
    lastFetch: new Date(now - 60_000).toISOString(),
  };
}

/** A stored state whose reading cannot be dated, so it cannot be presented as current. */
export function undatedState(): WeatherState {
  return { ...freshState(), lastFetch: 'whenever' };
}

/** A stored state whose reading is past the staleness threshold. */
export function staleState(now = Date.now()): WeatherState {
  return {
    location: LONDON,
    snapshot: snapshot(),
    lastFetch: new Date(now - (WEATHER_STALE_MS + 60_000)).toISOString(),
  };
}

/** Resolves only when the returned `release` is called — for driving in-flight races. */
export function deferred<T>(): { promise: Promise<T>; release: (value: T) => void } {
  let release: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
