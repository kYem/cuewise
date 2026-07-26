import {
  logger,
  mapWmoCode,
  roundCoordinate,
  toLocalIso,
  type WeatherForecast,
  type WeatherHour,
  type WeatherLocation,
  type WeatherUnits,
} from '@cuewise/shared';
import type { Context, Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
import { problem } from '../problem-details';

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

const UPSTREAM_TIMEOUT_MS = 5_000;

const FORECAST_CACHE_SECONDS = 600;
const GEOCODING_CACHE_SECONDS = 86_400;

const MAX_QUERY_LENGTH = 80;
const MAX_SEARCH_RESULTS = 5;

/** Injectable so tests drive the routes without touching the network. */
export type UpstreamFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface WeatherDeps {
  weatherUpstream: UpstreamFetch;
}

/** Rejects '', NaN and Infinity as well as out-of-range values. */
function parseBoundedNumber(raw: string | undefined, min: number, max: number): number | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return null;
  }
  return value;
}

function parseUnits(raw: string | undefined): WeatherUnits {
  return raw === 'imperial' ? 'imperial' : 'metric';
}

/**
 * Null on any failure; callers turn that into `upstream_unavailable`.
 *
 * `cacheTtl` is the only caching left once the routes are POST: it keys on the upstream
 * GET's rounded-coordinate URL, which is what lets nearby users share one provider call.
 */
async function fetchUpstream(
  doFetch: UpstreamFetch,
  url: string,
  cacheSeconds: number
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await doFetch(url, {
      signal: controller.signal,
      cf: { cacheEverything: true, cacheTtl: cacheSeconds },
    });
    if (!response.ok) {
      logger.warn('Weather upstream returned a non-OK status', { status: response.status });
      return null;
    }
    return await response.json();
  } catch (error) {
    // Metadata only — the URL carries coordinates, so it must never reach the log.
    logger.warn('Weather upstream request failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface OpenMeteoForecast {
  timezone?: unknown;
  current?: {
    temperature_2m?: unknown;
    apparent_temperature?: unknown;
    weather_code?: unknown;
    is_day?: unknown;
  };
  hourly?: { time?: unknown; temperature_2m?: unknown; weather_code?: unknown };
  daily?: {
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    sunrise?: unknown;
    sunset?: unknown;
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstNumber(value: unknown): number | null {
  return Array.isArray(value) ? readNumber(value[0]) : null;
}

function firstString(value: unknown): string | null {
  if (!Array.isArray(value) || typeof value[0] !== 'string') {
    return null;
  }
  return value[0];
}

/**
 * Daylight for one hourly stamp. Every stamp here is local to the same place and in the
 * same format, so string comparison is the whole calculation. Unknown sun times default
 * to daylight — the strip has to draw something, and a sun is the neutral choice.
 */
function isDaylight(time: string, sunrise: string | null, sunset: string | null): boolean {
  if (sunrise === null || sunset === null) {
    return true;
  }
  return time >= sunrise && time < sunset;
}

/**
 * Strict `=== 1`: reading anything non-zero as daylight counted a missing field and the
 * string "0" as day. An unreadable flag defers to the day's own sun window, not a guess.
 */
function currentIsDaylight(payload: OpenMeteoForecast, timezone: string): boolean {
  const flag = readNumber(payload.current?.is_day);
  if (flag !== null) {
    return flag === 1;
  }
  return isDaylight(
    toLocalIso(new Date(), timezone),
    firstString(payload.daily?.sunrise),
    firstString(payload.daily?.sunset)
  );
}

/** Zips the parallel hourly arrays into records, dropping any incomplete slot. */
function normalizeHours(
  hourly: OpenMeteoForecast['hourly'],
  daily: OpenMeteoForecast['daily']
): WeatherHour[] {
  const times = hourly?.time;
  const temperatures = hourly?.temperature_2m;
  const codes = hourly?.weather_code;
  if (!Array.isArray(times) || !Array.isArray(temperatures)) {
    return [];
  }
  const sunrise = firstString(daily?.sunrise);
  const sunset = firstString(daily?.sunset);
  const hours: WeatherHour[] = [];
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    const temperature = readNumber(temperatures[i]);
    if (typeof time !== 'string' || temperature === null) {
      continue;
    }
    hours.push({
      time,
      temperature,
      condition: mapWmoCode(Array.isArray(codes) ? codes[i] : undefined),
      isDay: isDaylight(time, sunrise, sunset),
    });
  }
  return hours;
}

/** Null for an empty day — `Math.max()` of nothing is -Infinity, not a temperature. */
function hourlyExtreme(hours: WeatherHour[], pick: (...values: number[]) => number): number | null {
  if (hours.length === 0) {
    return null;
  }
  return pick(...hours.map((hour) => hour.temperature));
}

/**
 * Null when the payload is unusable, so a provider changing shape surfaces as
 * `upstream_unavailable` rather than a half-rendered chip.
 */
function normalizeForecast(raw: unknown, units: WeatherUnits): WeatherForecast | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const payload = raw as OpenMeteoForecast;
  const temperature = readNumber(payload.current?.temperature_2m);
  if (temperature === null) {
    return null;
  }
  const hours = normalizeHours(payload.hourly, payload.daily);
  // Deriving from the hourly range is fine; falling back to the current temperature is
  // not — H === L === now is fabricated weather that reads as measured.
  const high = firstNumber(payload.daily?.temperature_2m_max) ?? hourlyExtreme(hours, Math.max);
  const low = firstNumber(payload.daily?.temperature_2m_min) ?? hourlyExtreme(hours, Math.min);
  if (high === null || low === null) {
    return null;
  }
  const timezone = typeof payload.timezone === 'string' ? payload.timezone : 'UTC';
  const isDay = currentIsDaylight(payload, timezone);
  return {
    units,
    timezone,
    current: {
      temperature,
      apparentTemperature: readNumber(payload.current?.apparent_temperature),
      condition: mapWmoCode(payload.current?.weather_code),
      isDay,
    },
    high,
    low,
    hours,
  };
}

/** Which blocks the provider sent, so a shape change is diagnosable from the log alone. */
function describeForecastShape(raw: unknown): Record<string, unknown> {
  const payload = (raw ?? {}) as OpenMeteoForecast;
  return {
    hasCurrent: payload.current !== undefined,
    hasTemperature: readNumber(payload.current?.temperature_2m) !== null,
    hasDaily: payload.daily !== undefined,
    hourCount: Array.isArray(payload.hourly?.time) ? payload.hourly.time.length : 0,
  };
}

interface OpenMeteoPlace {
  id?: unknown;
  name?: unknown;
  admin1?: unknown;
  country?: unknown;
  country_code?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  timezone?: unknown;
}

function normalizePlace(raw: unknown): WeatherLocation | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const place = raw as OpenMeteoPlace;
  const latitude = readNumber(place.latitude);
  const longitude = readNumber(place.longitude);
  // timezone drives every "today" comparison, so a place without one is unusable.
  if (typeof place.name !== 'string' || latitude === null || longitude === null) {
    return null;
  }
  if (typeof place.timezone !== 'string' || place.timezone === '') {
    return null;
  }
  return {
    id: String(place.id ?? `${latitude},${longitude}`),
    name: place.name,
    admin1: typeof place.admin1 === 'string' ? place.admin1 : null,
    country: typeof place.country === 'string' ? place.country : '',
    countryCode: typeof place.country_code === 'string' ? place.country_code : '',
    latitude,
    longitude,
    timezone: place.timezone,
  };
}

/**
 * No `Cache-Control`: browsers do not cache POST responses, so advertising one would be a
 * promise nothing keeps. Sharing happens a layer up, on the `cacheTtl` subrequest.
 */
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Through the shared parser, which refuses an over-declared `Content-Length` with 413
 * before buffering it — these two are the only unauthenticated JSON bodies the Worker
 * accepts. Returns the problem Response to send, or the object, or null for a body that
 * parsed but isn't an object.
 */
async function readJsonBody(c: Context): Promise<Response | Record<string, unknown> | null> {
  const raw = await parseJsonBody(c);
  if (raw instanceof Response) {
    return raw;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

function readParam(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' ? String(value) : undefined;
}

/**
 * Weather proxy so users never talk to a third party (ENG-18).
 *
 * Both routes are unauthenticated and stateless — no SyncStore, no D1 write, nothing
 * stored per user — which keeps "the server stores ciphertext only" literally true.
 *
 * Privacy invariant, enforced by `weather.test.ts`: **never log `lat`, `lon`, or `q`.**
 * A proxy that logs locations is worse than no proxy.
 *
 * POST, not GET, for a pair of reads: a Fetch invocation log records `<Method> <URL>` plus
 * the request headers, so coordinates in a query string would land in Workers Logs no
 * matter how careful this file is. A body is the one part of the request the platform does
 * not capture, which is what lets `invocation_logs` stay on for the sync routes next door.
 * The cost is that the responses are no longer browser-cacheable; the `cacheTtl` on the
 * upstream subrequest is what actually dedups provider calls, and it is untouched.
 */
export function registerWeatherRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: WeatherDeps
): void {
  app.post('/v1/weather', async (c) => {
    const body = await readJsonBody(c);
    if (body instanceof Response) {
      return body;
    }
    const latitude = parseBoundedNumber(readParam(body?.lat), -90, 90);
    const longitude = parseBoundedNumber(readParam(body?.lon), -180, 180);
    if (latitude === null || longitude === null) {
      return problem('invalid_request', {
        detail: 'lat and lon are required and must be finite coordinates.',
      });
    }
    const units = parseUnits(readParam(body?.units));
    // Rounded again even though the client already does: a request that arrives by any
    // other route must not get finer coordinates forwarded upstream than one that doesn't.
    const lat = roundCoordinate(latitude);
    const lon = roundCoordinate(longitude);

    const url = new URL(FORECAST_ENDPOINT);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,is_day');
    url.searchParams.set('hourly', 'temperature_2m,weather_code');
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,sunrise,sunset');
    url.searchParams.set('forecast_days', '1');
    // Safe to cache: the provider resolves `auto` from the coordinates, not the caller's
    // IP, so one cached body is correct for everyone asking about this place.
    url.searchParams.set('timezone', 'auto');
    if (units === 'imperial') {
      url.searchParams.set('temperature_unit', 'fahrenheit');
    }

    const raw = await fetchUpstream(deps.weatherUpstream, url.toString(), FORECAST_CACHE_SECONDS);
    if (raw === null) {
      return problem('upstream_unavailable', {
        detail: 'The weather provider is unavailable; try again shortly.',
      });
    }
    const forecast = normalizeForecast(raw, units);
    if (forecast === null) {
      // The one failure that means *our* normalizer no longer matches the provider, so it
      // must not be the one that logs nothing. Shape only — no coordinates.
      logger.warn('Weather forecast payload was unusable', describeForecastShape(raw));
      return problem('upstream_unavailable', {
        detail: 'The weather provider returned an unusable response.',
      });
    }
    return json(forecast);
  });

  // POST for the same reason as the forecast route: "which city did this person look up"
  // is the other half of the location they are trying not to hand over.
  app.post('/v1/weather/search', async (c) => {
    const body = await readJsonBody(c);
    if (body instanceof Response) {
      return body;
    }
    const query = readParam(body?.q)?.trim() ?? '';
    if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
      return problem('invalid_request', {
        detail: `q must be between 2 and ${MAX_QUERY_LENGTH} characters.`,
      });
    }

    const url = new URL(GEOCODING_ENDPOINT);
    url.searchParams.set('name', query);
    url.searchParams.set('count', String(MAX_SEARCH_RESULTS));
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const raw = await fetchUpstream(deps.weatherUpstream, url.toString(), GEOCODING_CACHE_SECONDS);
    if (raw === null) {
      return problem('upstream_unavailable', {
        detail: 'The geocoding provider is unavailable; try again shortly.',
      });
    }
    // Open-Meteo omits `results` entirely for a no-match query — an empty list, not an
    // error. An envelope we cannot read is a different thing, and must not be reported as
    // "no such city": that tells the user their town does not exist and leaves them stuck.
    const results = (raw as { results?: unknown })?.results;
    const readable = raw !== null && typeof raw === 'object' && !Array.isArray(raw);
    if (!readable || (results !== undefined && !Array.isArray(results))) {
      logger.warn('Geocoding envelope was unreadable', {
        envelopeType: Array.isArray(raw) ? 'array' : typeof raw,
        resultsType: typeof results,
      });
      return problem('upstream_unavailable', {
        detail: 'The geocoding provider returned an unusable response.',
      });
    }
    const received = Array.isArray(results) ? results : [];
    const places = received
      .map(normalizePlace)
      .filter((place): place is WeatherLocation => place !== null)
      .slice(0, MAX_SEARCH_RESULTS);
    if (received.length > 0 && places.length === 0) {
      logger.warn('Geocoding matches were all unusable', { received: received.length });
      return problem('upstream_unavailable', {
        detail: 'The geocoding provider returned an unusable response.',
      });
    }
    return json({ results: places });
  });
}
