import {
  getHttpFetch,
  roundCoordinate,
  WEATHER_CONDITION_KINDS,
  WEATHER_UNITS,
  type WeatherConditionKind,
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
  /**
   * Both carried for the log, not the message: a status tells a 404 (routes not deployed)
   * from a 500, and `cause` separates a thrown `Error` (usually `TypeError` — offline, DNS,
   * a CORS refusal) from a rejection that is not one at all, which is how the Tauri http
   * plugin reports a capability-scope denial. Its *name* only — a transport error's message
   * can embed the URL, the one thing that must never be logged.
   */
  constructor(
    message = 'The weather request failed',
    readonly status: number | null = null,
    readonly cause: string | null = null
  ) {
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

  // The timer stays armed until the body is read, not just until the headers land. A
  // response that stalls mid-body would otherwise never settle, and a fetch that never
  // settles never releases the store's in-flight slot — no error, no retry, until reload.
  try {
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
        isAbort(error) ? 'The weather request timed out' : 'Could not reach the weather service',
        null,
        error instanceof Error ? error.name : `non-error:${typeof error}`
      );
    }

    if (response.status === 429) {
      throw new WeatherRateLimitedError(parseRetryAfter(response));
    }
    if (response.status === 503) {
      throw new WeatherUnavailableError();
    }
    if (!response.ok) {
      throw new WeatherRequestError('The weather request failed', response.status);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new WeatherRequestError(
        isAbort(error)
          ? 'The weather request timed out'
          : 'The weather service returned an unreadable response',
        response.status
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isCondition(value: unknown): value is WeatherConditionKind {
  return WEATHER_CONDITION_KINDS.includes(value as WeatherConditionKind);
}

/** Every field the strip renders, including the ones whose absence throws mid-render. */
function isHour(value: unknown): value is WeatherHour {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const hour = value as Partial<WeatherHour>;
  return (
    typeof hour.time === 'string' &&
    typeof hour.temperature === 'number' &&
    typeof hour.isDay === 'boolean' &&
    isCondition(hour.condition)
  );
}

/** The block the chip renders; `apparentTemperature` is the one field allowed to be null. */
function isCurrentConditions(value: unknown): value is WeatherForecast['current'] {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const current = value as Partial<WeatherForecast['current']>;
  return (
    typeof current.temperature === 'number' &&
    typeof current.isDay === 'boolean' &&
    isCondition(current.condition) &&
    (current.apparentTemperature === null || typeof current.apparentTemperature === 'number')
  );
}

/**
 * Checks the string unions too, not just the numbers: `units` drives the refetch loop and
 * the scale announced to screen readers, and `condition` is interpolated into an aria-label,
 * so narrowing to them without verifying them is how "undefined" ends up being read aloud.
 */
function isForecast(value: unknown): value is WeatherForecast {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const forecast = value as Partial<WeatherForecast>;
  return (
    WEATHER_UNITS.includes(forecast.units as WeatherUnits) &&
    typeof forecast.timezone === 'string' &&
    isCurrentConditions(forecast.current) &&
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
  const results =
    raw === null || typeof raw !== 'object' ? undefined : (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    throw new WeatherRequestError('The weather service returned an unexpected response');
  }
  const places = results.filter(isWeatherLocation);
  // The proxy refuses to pass off unreadable matches as "no such city"; dropping them
  // silently here would reintroduce exactly that on any client/worker version drift.
  if (results.length > 0 && places.length === 0) {
    throw new WeatherRequestError('The weather service returned an unexpected response');
  }
  return places;
}

/** "Vilnius, Vilnius County, Lithuania" — skips parts the provider didn't supply. */
export function describeLocation(location: WeatherLocation): string {
  return [location.name, location.admin1, location.country]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(', ');
}
