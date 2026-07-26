import { env } from 'cloudflare:test';
import { logger } from '@cuewise/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../index';
import type { UpstreamFetch } from './weather';

const FORECAST_PAYLOAD = {
  timezone: 'Europe/London',
  current: {
    temperature_2m: 19.6,
    apparent_temperature: 18.8,
    weather_code: 0,
    is_day: 1,
  },
  hourly: {
    time: ['2026-07-25T00:00', '2026-07-25T01:00', '2026-07-25T02:00'],
    temperature_2m: [14.1, 13.8, 13.2],
    weather_code: [0, 2, 61],
  },
  daily: {
    temperature_2m_max: [21.4],
    temperature_2m_min: [11.2],
  },
};

const GEOCODING_PAYLOAD = {
  results: [
    {
      id: 593116,
      name: 'Vilnius',
      latitude: 54.68916,
      longitude: 25.2798,
      country_code: 'LT',
      country: 'Lithuania',
      admin1: 'Vilnius',
      timezone: 'Europe/Vilnius',
    },
  ],
};

/** Records every upstream call so tests can assert on what actually left the worker. */
function stubUpstream(
  payload: unknown,
  init: { ok?: boolean } = {}
): {
  fetch: UpstreamFetch;
  urls: string[];
  inits: (RequestInit | undefined)[];
} {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetchFn: UpstreamFetch = async (url, requestInit) => {
    urls.push(url);
    inits.push(requestInit);
    if (init.ok === false) {
      return new Response('upstream exploded', { status: 502 });
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetch: fetchFn, urls, inits };
}

function failingUpstream(error: Error): UpstreamFetch {
  return async () => {
    throw error;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /v1/weather', () => {
  it('returns a normalized forecast', async () => {
    const upstream = stubUpstream(FORECAST_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request('/v1/weather?lat=51.5074&lon=-0.1278', {}, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      units: 'metric',
      timezone: 'Europe/London',
      current: {
        temperature: 19.6,
        apparentTemperature: 18.8,
        condition: 'clear',
        isDay: true,
      },
      high: 21.4,
      low: 11.2,
      hours: [
        { time: '2026-07-25T00:00', temperature: 14.1, condition: 'clear' },
        { time: '2026-07-25T01:00', temperature: 13.8, condition: 'partly-cloudy' },
        { time: '2026-07-25T02:00', temperature: 13.2, condition: 'rain' },
      ],
    });
  });

  it('rounds coordinates to 2dp before they leave the worker', async () => {
    const upstream = stubUpstream(FORECAST_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    await app.request('/v1/weather?lat=51.50735678&lon=-0.12775432', {}, env);

    const sent = new URL(upstream.urls[0]);
    expect(sent.searchParams.get('latitude')).toBe('51.51');
    expect(sent.searchParams.get('longitude')).toBe('-0.13');
  });

  it('requests fahrenheit only for imperial units', async () => {
    const metric = stubUpstream(FORECAST_PAYLOAD);
    await createApp({ weatherUpstream: metric.fetch }).request('/v1/weather?lat=1&lon=2', {}, env);
    expect(new URL(metric.urls[0]).searchParams.get('temperature_unit')).toBeNull();

    const imperial = stubUpstream(FORECAST_PAYLOAD);
    const res = await createApp({ weatherUpstream: imperial.fetch }).request(
      '/v1/weather?lat=1&lon=2&units=imperial',
      {},
      env
    );

    expect(new URL(imperial.urls[0]).searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(await res.json()).toMatchObject({ units: 'imperial' });
  });

  it('sets a cache-control header so a repeat tab hits the browser cache', async () => {
    const upstream = stubUpstream(FORECAST_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=600');
  });

  // Cloudflare will not cache the worker's own JSON response, so the cross-user dedup
  // has to come from caching the subrequest on its rounded-coordinate URL.
  it('asks the edge to cache the upstream call', async () => {
    const upstream = stubUpstream(FORECAST_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(upstream.inits[0]?.cf).toEqual({ cacheEverything: true, cacheTtl: 600 });
  });

  it.each([
    ['missing both', '/v1/weather'],
    ['missing lon', '/v1/weather?lat=51.5'],
    ['non-numeric lat', '/v1/weather?lat=abc&lon=0'],
    ['empty lat', '/v1/weather?lat=&lon=0'],
    ['lat out of range', '/v1/weather?lat=91&lon=0'],
    ['lon out of range', '/v1/weather?lat=0&lon=181'],
    ['infinite lat', '/v1/weather?lat=Infinity&lon=0'],
  ])('rejects %s with invalid_request', async (_label, path) => {
    const upstream = stubUpstream(FORECAST_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request(path, {}, env);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'invalid_request' });
    expect(upstream.urls).toEqual([]);
  });

  it('answers 503 upstream_unavailable when the provider errors', async () => {
    const upstream = stubUpstream(FORECAST_PAYLOAD, { ok: false });
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'upstream_unavailable' });
  });

  it('answers 503 rather than throwing when the provider times out', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const app = createApp({ weatherUpstream: failingUpstream(abort) });

    const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(res.status).toBe(503);
  });

  it('answers 503 when the provider payload is unusable', async () => {
    const app = createApp({ weatherUpstream: stubUpstream({ current: {} }).fetch });

    const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'upstream_unavailable' });
  });

  it('falls back to the hourly range when the provider omits the daily block', async () => {
    const { daily: _omitted, ...withoutDaily } = FORECAST_PAYLOAD;
    const app = createApp({ weatherUpstream: stubUpstream(withoutDaily).fetch });

    const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(await res.json()).toMatchObject({ high: 14.1, low: 13.2 });
  });

  // H === L === current is fabricated weather that reads exactly like a measurement.
  it('answers 503 rather than inventing a high and low from the current temperature', async () => {
    const { daily: _d, hourly: _h, ...bare } = FORECAST_PAYLOAD;
    const app = createApp({ weatherUpstream: stubUpstream(bare).fetch });

    const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(res.status).toBe(503);
  });

  it('drops a place the geocoder gave no timezone for, since every hour depends on it', async () => {
    const { timezone: _tz, ...noZone } = GEOCODING_PAYLOAD.results[0];
    const app = createApp({ weatherUpstream: stubUpstream({ results: [noZone] }).fetch });

    const res = await app.request('/v1/weather/search?q=vilni', {}, env);

    expect(await res.json()).toEqual({ results: [] });
  });

  it('drops hourly slots the provider left incomplete', async () => {
    const ragged = {
      ...FORECAST_PAYLOAD,
      hourly: {
        time: ['2026-07-25T00:00', '2026-07-25T01:00', '2026-07-25T02:00'],
        temperature_2m: [14.1, null, 13.2],
        weather_code: [0, 0, 0],
      },
    };
    const app = createApp({ weatherUpstream: stubUpstream(ragged).fetch });

    const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    const body = (await res.json()) as { hours: unknown[] };
    expect(body.hours).toHaveLength(2);
  });

  it('reports night when the provider says is_day is 0', async () => {
    const night = { ...FORECAST_PAYLOAD, current: { ...FORECAST_PAYLOAD.current, is_day: 0 } };
    const app = createApp({ weatherUpstream: stubUpstream(night).fetch });

    const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(await res.json()).toMatchObject({ current: { isDay: false } });
  });
});

describe('GET /v1/weather/search', () => {
  it('returns normalized places', async () => {
    const app = createApp({ weatherUpstream: stubUpstream(GEOCODING_PAYLOAD).fetch });

    const res = await app.request('/v1/weather/search?q=vilni', {}, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        {
          id: '593116',
          name: 'Vilnius',
          admin1: 'Vilnius',
          country: 'Lithuania',
          countryCode: 'LT',
          latitude: 54.68916,
          longitude: 25.2798,
          timezone: 'Europe/Vilnius',
        },
      ],
    });
  });

  it('returns an empty list when the provider omits results', async () => {
    const app = createApp({ weatherUpstream: stubUpstream({}).fetch });

    const res = await app.request('/v1/weather/search?q=zzzzzz', {}, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('drops places missing the fields the picker needs', async () => {
    const partial = { results: [{ name: 'Nowhere' }, GEOCODING_PAYLOAD.results[0]] };
    const app = createApp({ weatherUpstream: stubUpstream(partial).fetch });

    const res = await app.request('/v1/weather/search?q=vilni', {}, env);

    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toHaveLength(1);
  });

  it.each([
    ['empty', '/v1/weather/search?q='],
    ['single character', '/v1/weather/search?q=a'],
    ['whitespace only', '/v1/weather/search?q=%20%20'],
    ['missing', '/v1/weather/search'],
    ['over the length cap', `/v1/weather/search?q=${'a'.repeat(81)}`],
  ])('rejects a %s query with invalid_request', async (_label, path) => {
    const upstream = stubUpstream(GEOCODING_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request(path, {}, env);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'invalid_request' });
    expect(upstream.urls).toEqual([]);
  });

  it('answers 503 when the geocoding provider errors', async () => {
    const app = createApp({
      weatherUpstream: stubUpstream(GEOCODING_PAYLOAD, { ok: false }).fetch,
    });

    const res = await app.request('/v1/weather/search?q=vilni', {}, env);

    expect(res.status).toBe(503);
  });

  it('caches place lookups for far longer than forecasts', async () => {
    const upstream = stubUpstream(GEOCODING_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request('/v1/weather/search?q=vilni', {}, env);

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(upstream.inits[0]?.cf).toEqual({ cacheEverything: true, cacheTtl: 86_400 });
  });

  it('caps the list even if the provider ignores the requested count', async () => {
    const many = {
      results: Array.from({ length: 12 }, (_, i) => ({
        ...GEOCODING_PAYLOAD.results[0],
        id: 1000 + i,
      })),
    };
    const app = createApp({ weatherUpstream: stubUpstream(many).fetch });

    const res = await app.request('/v1/weather/search?q=vilni', {}, env);

    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toHaveLength(5);
  });
});

describe('weather routes never log what the user asked about', () => {
  function captureLogs(): string[] {
    const captured: string[] = [];
    // Error.message and .stack are non-enumerable, so JSON.stringify(err) is '{}' — the
    // exact shape a URL-bearing fetch error arrives in. Flatten them explicitly.
    const flatten = (arg: unknown): string => {
      if (arg instanceof Error) {
        return `${arg.name} ${arg.message} ${arg.stack ?? ''}`;
      }
      return JSON.stringify(arg) ?? String(arg);
    };
    const record = (...args: unknown[]): void => {
      captured.push(args.map(flatten).join(' '));
    };
    vi.spyOn(logger, 'error').mockImplementation(record);
    vi.spyOn(logger, 'warn').mockImplementation(record);
    vi.spyOn(logger, 'info').mockImplementation(record);
    vi.spyOn(logger, 'debug').mockImplementation(record);
    return captured;
  }

  it('keeps coordinates out of the logs when the provider fails', async () => {
    const logs = captureLogs();
    const app = createApp({ weatherUpstream: stubUpstream(FORECAST_PAYLOAD, { ok: false }).fetch });

    await app.request('/v1/weather?lat=51.50735678&lon=-0.12775432', {}, env);

    const combined = logs.join('\n');
    expect(combined).not.toContain('51.5');
    expect(combined).not.toContain('0.12');
    expect(combined).not.toContain('latitude');
    expect(combined).not.toContain('open-meteo');
  });

  it('keeps the search query out of the logs when the provider fails', async () => {
    const logs = captureLogs();
    const app = createApp({ weatherUpstream: failingUpstream(new Error('boom')) });

    await app.request('/v1/weather/search?q=Vilnius', {}, env);

    expect(logs.join('\n')).not.toContain('Vilnius');
  });

  it('keeps the thrown error message out of the logs, since it can embed the URL', async () => {
    const logs = captureLogs();
    const leaky = new Error(
      'request to https://api.open-meteo.com/v1/forecast?latitude=51.5 failed'
    );
    const app = createApp({ weatherUpstream: failingUpstream(leaky) });

    await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

    expect(logs.join('\n')).not.toContain('51.5');
  });
});

// Both routes are unauthenticated, so the per-IP limiter is the only thing standing between
// the proxy and someone using it as a free weather API. Deleting the `app.use` line in
// index.ts failed nothing before these existed.
describe('weather routes are rate limited per IP', () => {
  const IP = { 'CF-Connecting-IP': '203.0.113.7' };

  async function floodForecast(app: ReturnType<typeof createApp>, times: number) {
    let last: Response | null = null;
    for (let i = 0; i < times; i++) {
      last = await app.request('/v1/weather?lat=51.5&lon=-0.13', { headers: IP }, env);
    }
    return last;
  }

  // The middleware is registered at '/v1/weather/*', which must also cover the bare path —
  // the forecast route is the hot one, so a wildcard that missed it would leave the endpoint
  // that actually gets called wide open.
  it('limits the bare forecast path, not just the sub-paths', async () => {
    const app = createApp({ weatherUpstream: stubUpstream(FORECAST_PAYLOAD).fetch });

    const allowed = await floodForecast(app, 30);
    expect(allowed?.status).toBe(200);

    const blocked = await floodForecast(app, 1);
    expect(blocked?.status).toBe(429);
    expect(await blocked?.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('limits the search path', async () => {
    const app = createApp({ weatherUpstream: stubUpstream(GEOCODING_PAYLOAD).fetch });

    let last: Response | null = null;
    for (let i = 0; i < 31; i++) {
      last = await app.request('/v1/weather/search?q=Vilnius', { headers: IP }, env);
    }

    expect(last?.status).toBe(429);
  });

  // Its own counter, or a burst of weather lookups would spend the sign-in budget and lock
  // the user out of the thing that actually matters.
  it('does not spend the budget the sign-in routes rely on', async () => {
    const app = createApp({ weatherUpstream: stubUpstream(FORECAST_PAYLOAD).fetch });

    await floodForecast(app, 31);
    const signIn = await app.request('/v1/auth/apple/start', { headers: IP }, env);

    expect(signIn.status).not.toBe(429);
  });
});

// Same rule as the high/low: a number the provider never sent must not render like one
// it did. Null lets the client drop the row instead of repeating the current temperature.
it('reports no apparent temperature rather than repeating the current one', async () => {
  const withoutApparent = {
    ...FORECAST_PAYLOAD,
    current: { ...FORECAST_PAYLOAD.current, apparent_temperature: null },
  };
  const app = createApp({ weatherUpstream: stubUpstream(withoutApparent).fetch });

  const res = await app.request('/v1/weather?lat=51.5&lon=-0.13', {}, env);

  const body = (await res.json()) as { current: { apparentTemperature: number | null } };
  expect(body.current.apparentTemperature).toBeNull();
});
