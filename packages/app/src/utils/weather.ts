import {
  getHttpFetch,
  roundCoordinate,
  type WeatherForecast,
  type WeatherHour,
  type WeatherLocation,
  type WeatherSnapshot,
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

/**
 * POST for what are plainly reads: the proxy's Workers Logs record the request URL and
 * headers but never the body, so where the user lives travels in the one part of the
 * request that is not written down. See the note on `registerWeatherRoutes`.
 */
async function requestJson(path: string, payload: Record<string, string>): Promise<unknown> {
  const doFetch = getHttpFetch();
  const url = `${resolveBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

/** Every field the popover reads, since a bad element throws mid-render, not at the edge. */
function isHour(value: unknown): value is WeatherHour {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const hour = value as Partial<WeatherHour>;
  return typeof hour.time === 'string' && typeof hour.temperature === 'number';
}

function isForecast(value: unknown): value is WeatherForecast {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const forecast = value as Partial<WeatherForecast>;
  return (
    typeof forecast.current?.temperature === 'number' &&
    typeof forecast.current?.isDay === 'boolean' &&
    typeof forecast.high === 'number' &&
    typeof forecast.low === 'number' &&
    Array.isArray(forecast.hours) &&
    forecast.hours.every(isHour)
  );
}

/**
 * Every field, not just the ones today's UI happens to read: this also guards the location
 * restored from storage, which outlives any given version of the components.
 */
export function isWeatherLocation(value: unknown): value is WeatherLocation {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const place = value as Partial<WeatherLocation>;
  return (
    typeof place.id === 'string' &&
    typeof place.name === 'string' &&
    (place.admin1 === null || typeof place.admin1 === 'string') &&
    typeof place.country === 'string' &&
    typeof place.countryCode === 'string' &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    typeof place.timezone === 'string' &&
    place.timezone !== ''
  );
}

/**
 * Guards the storage read as well as the network reply. A snapshot that no longer matches
 * this shape would throw inside the chip's render, and the app-wide ErrorBoundary would
 * take the whole new tab down — on every open, since the same blob is read back each time.
 */
export function isWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  return isForecast(value) && isWeatherLocation((value as Partial<WeatherSnapshot>).location);
}

export async function fetchForecast(
  location: WeatherLocation,
  units: WeatherUnits
): Promise<WeatherForecast> {
  // Rounded here, not just at the proxy: precise coordinates should never leave the device
  // in the first place, and a city centroid loses nothing at ~1km.
  const raw = await requestJson('/v1/weather', {
    lat: String(roundCoordinate(location.latitude)),
    lon: String(roundCoordinate(location.longitude)),
    units,
  });
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
  const raw = await requestJson('/v1/weather/search', { q: trimmed });
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    throw new WeatherRequestError('The weather service returned an unexpected response');
  }
  return results.filter(isWeatherLocation);
}

/** "Vilnius, Vilnius County, Lithuania" — skips parts the provider didn't supply. */
export function describeLocation(location: WeatherLocation): string {
  return [location.name, location.admin1, location.country]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(', ');
}
