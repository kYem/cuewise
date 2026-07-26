import { configurePlatform, resetPlatform } from '@cuewise/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONDON } from '../stores/__fixtures__/weather-store.fixtures';
import {
  describeLocation,
  fetchForecast,
  searchLocations,
  WeatherError,
  WeatherRateLimitedError,
  WeatherRequestError,
  WeatherUnavailableError,
} from './weather';

const FORECAST = {
  units: 'metric',
  timezone: 'Europe/London',
  current: { temperature: 17, apparentTemperature: 15, condition: 'clear', isDay: true },
  high: 21,
  low: 11,
  hours: [{ time: '2026-07-25T10:00', temperature: 16, condition: 'clear', isDay: true }],
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  configurePlatform({ httpFetch: fetchMock });
});

afterEach(() => {
  resetPlatform();
});

describe('fetchForecast', () => {
  it('calls the proxy, never a weather provider directly', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FORECAST));

    await fetchForecast(LONDON, 'metric');

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe('https://api.cuewise.app');
    expect(url.pathname).toBe('/v1/weather');
  });

  // Coordinates travel in the body, not the query string: the proxy's invocation logs
  // record the URL and headers of every request, and never the body.
  it('sends the location coordinates and units in the request body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FORECAST));

    await fetchForecast(LONDON, 'imperial');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('lat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ lat: '51.51', lon: '-0.13', units: 'imperial' });
  });

  // A city centroid loses nothing at ~1km, and the proxy rounds to the same 2dp, so this
  // also keeps both sides keying the same upstream cache entry.
  it('rounds the coordinates before they leave the device', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FORECAST));

    await fetchForecast({ ...LONDON, latitude: 51.50735678, longitude: -0.12775432 }, 'metric');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ lat: '51.51', lon: '-0.13' });
  });

  it('returns the parsed forecast', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FORECAST));

    await expect(fetchForecast(LONDON, 'metric')).resolves.toEqual(FORECAST);
  });

  it('raises a rate-limit error carrying the retry hint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 429, { 'Retry-After': '42' }));

    await expect(fetchForecast(LONDON, 'metric')).rejects.toBeInstanceOf(WeatherRateLimitedError);
  });

  it('exposes the retry-after seconds when the proxy sends one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 429, { 'Retry-After': '42' }));

    const error = await fetchForecast(LONDON, 'metric').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ retryAfterSeconds: 42 });
  });

  it('tolerates a missing or unparseable retry-after header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 429, { 'Retry-After': 'soon' }));

    const error = await fetchForecast(LONDON, 'metric').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ retryAfterSeconds: null });
  });

  it('raises an unavailable error for a 503', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503));

    await expect(fetchForecast(LONDON, 'metric')).rejects.toBeInstanceOf(WeatherUnavailableError);
  });

  it('raises a request error for any other failing status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 400));

    await expect(fetchForecast(LONDON, 'metric')).rejects.toBeInstanceOf(WeatherRequestError);
  });

  it('raises a request error when the transport throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await expect(fetchForecast(LONDON, 'metric')).rejects.toBeInstanceOf(WeatherRequestError);
  });

  it('reports a timeout distinctly in the message', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fetchMock.mockRejectedValue(abort);

    await expect(fetchForecast(LONDON, 'metric')).rejects.toThrow(/timed out/i);
  });

  it('raises a request error for unreadable JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));

    await expect(fetchForecast(LONDON, 'metric')).rejects.toBeInstanceOf(WeatherRequestError);
  });

  it('rejects a well-formed response missing the fields the widget needs', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ units: 'metric', timezone: 'UTC' }));

    await expect(fetchForecast(LONDON, 'metric')).rejects.toBeInstanceOf(WeatherRequestError);
  });

  it('lets a caller catch every failure through the base class', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503));

    await expect(fetchForecast(LONDON, 'metric')).rejects.toBeInstanceOf(WeatherError);
  });
});

describe('searchLocations', () => {
  it('returns the parsed places', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [LONDON] }));

    await expect(searchLocations('lond')).resolves.toEqual([LONDON]);
  });

  // Which city someone looked up is the other half of where they live, so it rides in the
  // body for the same reason the coordinates do.
  it('sends the trimmed query in the request body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

    await searchLocations('  lond  ');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('lond');
    expect(JSON.parse(init.body)).toEqual({ q: 'lond' });
  });

  it('short-circuits a query below the minimum length without calling the proxy', async () => {
    await expect(searchLocations('a')).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty list when the proxy finds nothing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

    await expect(searchLocations('zzzz')).resolves.toEqual([]);
  });

  it('drops malformed places rather than surfacing partial ones', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [{ name: 'Nowhere' }, LONDON] }));

    await expect(searchLocations('lond')).resolves.toEqual([LONDON]);
  });

  it('raises a request error when results is not a list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: 'nope' }));

    await expect(searchLocations('lond')).rejects.toBeInstanceOf(WeatherRequestError);
  });

  it('propagates rate limiting', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 429));

    await expect(searchLocations('lond')).rejects.toBeInstanceOf(WeatherRateLimitedError);
  });
});

describe('the http fetch port', () => {
  it('fails loudly when no platform fetch is registered', async () => {
    resetPlatform();

    await expect(fetchForecast(LONDON, 'metric')).rejects.toThrow(/httpfetch/i);
  });
});

describe('describeLocation', () => {
  it('joins the parts the provider supplied', () => {
    expect(describeLocation(LONDON)).toBe('London, England, United Kingdom');
  });

  it('skips a missing region', () => {
    expect(describeLocation({ ...LONDON, admin1: null })).toBe('London, United Kingdom');
  });

  it('skips an empty country', () => {
    expect(describeLocation({ ...LONDON, admin1: null, country: '' })).toBe('London');
  });
});

describe('the request deadline', () => {
  // The timer used to be cleared as soon as the headers arrived, so a body that stalled
  // mid-stream never settled — and a fetch that never settles never releases the store's
  // in-flight slot: no error, no retry, no spinner ending, until the tab is reloaded.
  it('still applies once the headers have arrived and the body is being read', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: () => Promise.reject(abort),
    });

    await expect(fetchForecast(LONDON, 'metric')).rejects.toThrow(/timed out/i);
  });

  it('reports a stalled body as a weather error, never as a raw abort', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: () => Promise.reject(abort),
    });

    await expect(fetchForecast(LONDON, 'metric')).rejects.toBeInstanceOf(WeatherError);
  });
});

describe('a failing status', () => {
  // "The weather request failed" alone cannot tell a 404 (routes not deployed) from a 500
  // (handler broken), and that string is all the support report would contain.
  it('is carried on the error so the log can name it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));

    const error = await fetchForecast(LONDON, 'metric').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 404 });
  });
});
