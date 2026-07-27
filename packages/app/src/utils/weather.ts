import {
  getHttpFetch,
  roundCoordinate,
  type WeatherForecast,
  type WeatherLocation,
  type WeatherSnapshot,
  type WeatherUnits,
  weatherForecastSchema,
  weatherLocationSchema,
  weatherSnapshotSchema,
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

/**
 * The wire shapes are the same shapes the store persists, so both go through the schemas
 * in @cuewise/shared rather than a second hand-rolled description that can drift from them.
 * These stay predicates because the callers are a filter and a storage guard, and because
 * returning zod's parsed copy would strip fields a newer proxy had added.
 */
export function isWeatherLocation(value: unknown): value is WeatherLocation {
  return weatherLocationSchema.safeParse(value).success;
}

export function isWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  return weatherSnapshotSchema.safeParse(value).success;
}

function isForecast(value: unknown): value is WeatherForecast {
  return weatherForecastSchema.safeParse(value).success;
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
