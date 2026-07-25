import {
  logger,
  mapWmoCode,
  type WeatherForecast,
  type WeatherHour,
  type WeatherLocation,
  type WeatherUnits,
} from '@cuewise/shared';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { problem } from '../problem-details';

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

const UPSTREAM_TIMEOUT_MS = 5_000;

/**
 * ~1km. Open-Meteo snaps to its own model grid regardless (51.51,-0.13 returns
 * 51.5,-0.25), so rounding costs no accuracy while making cache keys collide across
 * nearby users — cheaper, and less identifying.
 */
const COORD_DECIMALS = 2;

const FORECAST_CACHE_SECONDS = 600;
const GEOCODING_CACHE_SECONDS = 86_400;

const MAX_QUERY_LENGTH = 80;
const MAX_SEARCH_RESULTS = 5;

/** Injectable so tests drive the routes without touching the network. */
export type UpstreamFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface WeatherDeps {
  weatherUpstream: UpstreamFetch;
}

function roundCoord(value: number): number {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(value * factor) / factor;
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
 * `cacheTtl` is what actually gets the edge caching: Cloudflare does not cache a Worker's
 * own JSON response by default, so the `Cache-Control` we return only reaches the browser.
 * Caching the *subrequest* keys on the rounded-coordinate URL instead, which is what lets
 * nearby users share one upstream call.
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
  daily?: { temperature_2m_max?: unknown; temperature_2m_min?: unknown };
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstNumber(value: unknown): number | null {
  return Array.isArray(value) ? readNumber(value[0]) : null;
}

/** Zips the parallel hourly arrays into records, dropping any incomplete slot. */
function normalizeHours(hourly: OpenMeteoForecast['hourly']): WeatherHour[] {
  const times = hourly?.time;
  const temperatures = hourly?.temperature_2m;
  const codes = hourly?.weather_code;
  if (!Array.isArray(times) || !Array.isArray(temperatures)) {
    return [];
  }
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
    });
  }
  return hours;
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
  const hours = normalizeHours(payload.hourly);
  const hourTemperatures = hours.map((hour) => hour.temperature);
  // Deriving from the hourly range is fine; falling back to the current temperature is
  // not — H === L === now is fabricated weather that reads as measured.
  const high =
    firstNumber(payload.daily?.temperature_2m_max) ??
    (hourTemperatures.length > 0 ? Math.max(...hourTemperatures) : null);
  const low =
    firstNumber(payload.daily?.temperature_2m_min) ??
    (hourTemperatures.length > 0 ? Math.min(...hourTemperatures) : null);
  if (high === null || low === null) {
    return null;
  }
  return {
    units,
    timezone: typeof payload.timezone === 'string' ? payload.timezone : 'UTC',
    current: {
      temperature,
      apparentTemperature: readNumber(payload.current?.apparent_temperature) ?? temperature,
      condition: mapWmoCode(payload.current?.weather_code),
      isDay: payload.current?.is_day !== 0,
    },
    high,
    low,
    hours,
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

function cached(body: unknown, seconds: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${seconds}`,
    },
  });
}

/**
 * Weather proxy so users never talk to a third party (ENG-18).
 *
 * Both routes are unauthenticated and stateless — no SyncStore, no D1 write, nothing
 * stored per user — which keeps "the server stores ciphertext only" literally true.
 *
 * Privacy invariant, enforced by `weather.test.ts`: **never log `lat`, `lon`, or `q`.**
 * A proxy that logs locations is worse than no proxy.
 */
export function registerWeatherRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: WeatherDeps
): void {
  app.get('/v1/weather', async (c) => {
    const latitude = parseBoundedNumber(c.req.query('lat'), -90, 90);
    const longitude = parseBoundedNumber(c.req.query('lon'), -180, 180);
    if (latitude === null || longitude === null) {
      return problem('invalid_request', {
        detail: 'lat and lon are required and must be finite coordinates.',
      });
    }
    const units = parseUnits(c.req.query('units'));
    const lat = roundCoord(latitude);
    const lon = roundCoord(longitude);

    const url = new URL(FORECAST_ENDPOINT);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,is_day');
    url.searchParams.set('hourly', 'temperature_2m,weather_code');
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
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
      return problem('upstream_unavailable', {
        detail: 'The weather provider returned an unusable response.',
      });
    }
    return cached(forecast, FORECAST_CACHE_SECONDS);
  });

  app.get('/v1/weather/search', async (c) => {
    const query = c.req.query('q')?.trim() ?? '';
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
    // Open-Meteo omits `results` entirely for a no-match query — an empty list, not an error.
    const results = (raw as { results?: unknown }).results;
    const places = Array.isArray(results)
      ? results
          .map(normalizePlace)
          .filter((place): place is WeatherLocation => place !== null)
          .slice(0, MAX_SEARCH_RESULTS)
      : [];
    return cached({ results: places }, GEOCODING_CACHE_SECONDS);
  });
}
