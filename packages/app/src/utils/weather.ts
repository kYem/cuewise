import {
  getHttpFetch,
  type WeatherForecast,
  type WeatherLocation,
  type WeatherUnits,
} from '@cuewise/shared';

/**
 * Client for the weather proxy (ENG-18). Every request goes to api.cuewise.app, never to
 * a weather provider — the user's browser must not talk to a third party for this.
 *
 * HTTP goes through the `HttpFetch` port rather than the global because the Tauri webview
 * cannot reach the API at all.
 */

const REQUEST_TIMEOUT_MS = 8_000;

/** Mirrors the worker's own floor. */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Base class so a caller can catch every weather failure without listing each one. */
export class WeatherError extends Error {}

/** The caller must back off and keep showing whatever it cached. */
export class WeatherRateLimitedError extends WeatherError {
  constructor(readonly retryAfterSeconds: number | null) {
    super('Weather requests are rate limited');
    this.name = 'WeatherRateLimitedError';
  }
}

/** The provider is down or timed out — retryable. */
export class WeatherUnavailableError extends WeatherError {
  constructor() {
    super('The weather service is unavailable');
    this.name = 'WeatherUnavailableError';
  }
}

export class WeatherRequestError extends WeatherError {
  constructor(message = 'The weather request failed') {
    super(message);
    this.name = 'WeatherRequestError';
  }
}

function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_WEATHER_API_BASE_URL;
  if (typeof configured === 'string' && configured !== '') {
    return configured.replace(/\/+$/, '');
  }
  return 'https://api.cuewise.app';
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (header === null) {
    return null;
  }
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds;
}

async function requestJson(path: string, search: URLSearchParams): Promise<unknown> {
  const doFetch = getHttpFetch();
  const url = `${resolveBaseUrl()}${path}?${search.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    throw new WeatherRequestError(
      error instanceof Error && error.name === 'AbortError'
        ? 'The weather request timed out'
        : 'Could not reach the weather service'
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new WeatherRateLimitedError(parseRetryAfter(response));
  }
  if (response.status === 503) {
    throw new WeatherUnavailableError();
  }
  if (!response.ok) {
    throw new WeatherRequestError();
  }
  try {
    return await response.json();
  } catch {
    throw new WeatherRequestError('The weather service returned an unreadable response');
  }
}

function isForecast(value: unknown): value is WeatherForecast {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const forecast = value as Partial<WeatherForecast>;
  return (
    typeof forecast.current?.temperature === 'number' &&
    typeof forecast.high === 'number' &&
    typeof forecast.low === 'number' &&
    Array.isArray(forecast.hours)
  );
}

export async function fetchForecast(
  location: WeatherLocation,
  units: WeatherUnits
): Promise<WeatherForecast> {
  const search = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    units,
  });
  const raw = await requestJson('/v1/weather', search);
  if (!isForecast(raw)) {
    throw new WeatherRequestError('The weather service returned an unexpected response');
  }
  return raw;
}

export async function searchLocations(query: string): Promise<WeatherLocation[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
    return [];
  }
  const raw = await requestJson('/v1/weather/search', new URLSearchParams({ q: trimmed }));
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    throw new WeatherRequestError('The weather service returned an unexpected response');
  }
  return results.filter(isLocation);
}

function isLocation(value: unknown): value is WeatherLocation {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const place = value as Partial<WeatherLocation>;
  return (
    typeof place.id === 'string' &&
    typeof place.name === 'string' &&
    typeof place.latitude === 'number' &&
    typeof place.longitude === 'number' &&
    typeof place.timezone === 'string'
  );
}

/** "Vilnius, Vilnius County, Lithuania" — skips parts the provider didn't supply. */
export function describeLocation(location: WeatherLocation): string {
  return [location.name, location.admin1, location.country]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(', ');
}
