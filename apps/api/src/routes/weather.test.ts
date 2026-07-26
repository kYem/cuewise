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

/** Both routes are POST so the coordinates ride in the body, which Workers Logs ignore. */
function post(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

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

    const res = await app.request('/v1/weather', post({ lat: '51.5074', lon: '-0.1278' }), env);

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

    await app.request('/v1/weather', post({ lat: '51.50735678', lon: '-0.12775432' }), env);

    const sent = new URL(upstream.urls[0]);
    expect(sent.searchParams.get('latitude')).toBe('51.51');
    expect(sent.searchParams.get('longitude')).toBe('-0.13');
  });

  it('requests fahrenheit only for imperial units', async () => {
    const metric = stubUpstream(FORECAST_PAYLOAD);
    await createApp({ weatherUpstream: metric.fetch }).request(
      '/v1/weather',
      post({ lat: '1', lon: '2' }),
      env
    );
    expect(new URL(metric.urls[0]).searchParams.get('temperature_unit')).toBeNull();

    const imperial = stubUpstream(FORECAST_PAYLOAD);
    const res = await createApp({ weatherUpstream: imperial.fetch }).request(
      '/v1/weather',
      post({ lat: '1', lon: '2', units: 'imperial' }),
      env
    );

    expect(new URL(imperial.urls[0]).searchParams.get('temperature_unit')).toBe('fahrenheit');
    expect(await res.json()).toMatchObject({ units: 'imperial' });
  });

  // Browsers do not cache POST responses, so a Cache-Control here would promise sharing
  // that never happens — the honest place for it is the subrequest below.
  it('does not advertise a cache it cannot keep', async () => {
    const upstream = stubUpstream(FORECAST_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  // Cloudflare will not cache the worker's own JSON response, so the cross-user dedup
  // has to come from caching the subrequest on its rounded-coordinate URL.
  it('asks the edge to cache the upstream call', async () => {
    const upstream = stubUpstream(FORECAST_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(upstream.inits[0]?.cf).toEqual({ cacheEverything: true, cacheTtl: 600 });
  });

  it.each([
    ['missing both', {}],
    ['missing lon', { lat: '51.5' }],
    ['non-numeric lat', { lat: 'abc', lon: '0' }],
    ['empty lat', { lat: '', lon: '0' }],
    ['lat out of range', { lat: '91', lon: '0' }],
    ['lon out of range', { lat: '0', lon: '181' }],
    ['infinite lat', { lat: 'Infinity', lon: '0' }],
    ['a null body', null],
    ['an array body', []],
    ['a nested object where a number belongs', { lat: { toString: 1 }, lon: '0' }],
  ])('rejects %s with invalid_request', async (_label, body) => {
    const upstream = stubUpstream(FORECAST_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request('/v1/weather', post(body), env);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'invalid_request' });
    expect(upstream.urls).toEqual([]);
  });

  it('answers 503 upstream_unavailable when the provider errors', async () => {
    const upstream = stubUpstream(FORECAST_PAYLOAD, { ok: false });
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'upstream_unavailable' });
  });

  it('answers 503 rather than throwing when the provider times out', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const app = createApp({ weatherUpstream: failingUpstream(abort) });

    const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(res.status).toBe(503);
  });

  it('answers 503 when the provider payload is unusable', async () => {
    const app = createApp({ weatherUpstream: stubUpstream({ current: {} }).fetch });

    const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'upstream_unavailable' });
  });

  it('falls back to the hourly range when the provider omits the daily block', async () => {
    const { daily: _omitted, ...withoutDaily } = FORECAST_PAYLOAD;
    const app = createApp({ weatherUpstream: stubUpstream(withoutDaily).fetch });

    const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(await res.json()).toMatchObject({ high: 14.1, low: 13.2 });
  });

  // H === L === current is fabricated weather that reads exactly like a measurement.
  it('answers 503 rather than inventing a high and low from the current temperature', async () => {
    const { daily: _d, hourly: _h, ...bare } = FORECAST_PAYLOAD;
    const app = createApp({ weatherUpstream: stubUpstream(bare).fetch });

    const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(res.status).toBe(503);
  });

  it('drops a place the geocoder gave no timezone for, since every hour depends on it', async () => {
    const { timezone: _tz, ...noZone } = GEOCODING_PAYLOAD.results[0];
    const app = createApp({ weatherUpstream: stubUpstream({ results: [noZone] }).fetch });

    const res = await app.request('/v1/weather/search', post({ q: 'vilni' }), env);

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

    const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    const body = (await res.json()) as { hours: unknown[] };
    expect(body.hours).toHaveLength(2);
  });

  it('reports night when the provider says is_day is 0', async () => {
    const night = { ...FORECAST_PAYLOAD, current: { ...FORECAST_PAYLOAD.current, is_day: 0 } };
    const app = createApp({ weatherUpstream: stubUpstream(night).fetch });

    const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(await res.json()).toMatchObject({ current: { isDay: false } });
  });
});

describe('GET /v1/weather/search', () => {
  it('returns normalized places', async () => {
    const app = createApp({ weatherUpstream: stubUpstream(GEOCODING_PAYLOAD).fetch });

    const res = await app.request('/v1/weather/search', post({ q: 'vilni' }), env);

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

    const res = await app.request('/v1/weather/search', post({ q: 'zzzzzz' }), env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('drops places missing the fields the picker needs', async () => {
    const partial = { results: [{ name: 'Nowhere' }, GEOCODING_PAYLOAD.results[0]] };
    const app = createApp({ weatherUpstream: stubUpstream(partial).fetch });

    const res = await app.request('/v1/weather/search', post({ q: 'vilni' }), env);

    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toHaveLength(1);
  });

  it.each([
    ['empty', { q: '' }],
    ['single character', { q: 'a' }],
    ['whitespace only', { q: '  ' }],
    ['missing', {}],
    ['over the length cap', { q: 'a'.repeat(81) }],
  ])('rejects a %s query with invalid_request', async (_label, body) => {
    const upstream = stubUpstream(GEOCODING_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    const res = await app.request('/v1/weather/search', post(body), env);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'invalid_request' });
    expect(upstream.urls).toEqual([]);
  });

  it('answers 503 when the geocoding provider errors', async () => {
    const app = createApp({
      weatherUpstream: stubUpstream(GEOCODING_PAYLOAD, { ok: false }).fetch,
    });

    const res = await app.request('/v1/weather/search', post({ q: 'vilni' }), env);

    expect(res.status).toBe(503);
  });

  it('caches place lookups for far longer than forecasts', async () => {
    const upstream = stubUpstream(GEOCODING_PAYLOAD);
    const app = createApp({ weatherUpstream: upstream.fetch });

    await app.request('/v1/weather/search', post({ q: 'vilni' }), env);

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

    const res = await app.request('/v1/weather/search', post({ q: 'vilni' }), env);

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

    await app.request('/v1/weather', post({ lat: '51.50735678', lon: '-0.12775432' }), env);

    const combined = logs.join('\n');
    expect(combined).not.toContain('51.5');
    expect(combined).not.toContain('0.12');
    expect(combined).not.toContain('latitude');
    expect(combined).not.toContain('open-meteo');
  });

  it('keeps the search query out of the logs when the provider fails', async () => {
    const logs = captureLogs();
    const app = createApp({ weatherUpstream: failingUpstream(new Error('boom')) });

    await app.request('/v1/weather/search', post({ q: 'Vilnius' }), env);

    expect(logs.join('\n')).not.toContain('Vilnius');
  });

  it('keeps the thrown error message out of the logs, since it can embed the URL', async () => {
    const logs = captureLogs();
    const leaky = new Error(
      'request to https://api.open-meteo.com/v1/forecast?latitude=51.5 failed'
    );
    const app = createApp({ weatherUpstream: failingUpstream(leaky) });

    await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

    expect(logs.join('\n')).not.toContain('51.5');
  });
});

// Both routes are unauthenticated, so the per-IP limiter is the only thing standing between
// the proxy and someone using it as a free weather API. Deleting the `app.use` line in
// index.ts failed nothing before these existed.
describe('weather routes are rate limited per IP', () => {
  const IP = { 'CF-Connecting-IP': '203.0.113.7' };
  const FORECAST_LIMIT = 120;
  const SEARCH_LIMIT = 60;

  async function flood(
    app: ReturnType<typeof createApp>,
    path: string,
    body: unknown,
    times: number
  ) {
    let last: Response | null = null;
    for (let i = 0; i < times; i++) {
      last = await app.request(path, post(body, IP), env);
    }
    return last;
  }

  const forecast = (app: ReturnType<typeof createApp>, times: number) =>
    flood(app, '/v1/weather', { lat: '51.5', lon: '-0.13' }, times);
  const search = (app: ReturnType<typeof createApp>, times: number) =>
    flood(app, '/v1/weather/search', { q: 'Vilnius' }, times);

  it('limits the forecast route once the budget is spent', async () => {
    const app = createApp({ weatherUpstream: stubUpstream(FORECAST_PAYLOAD).fetch });

    expect((await forecast(app, FORECAST_LIMIT))?.status).toBe(200);

    const blocked = await forecast(app, 1);
    expect(blocked?.status).toBe(429);
    expect(await blocked?.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('limits the search route on its own, tighter budget', async () => {
    const app = createApp({ weatherUpstream: stubUpstream(GEOCODING_PAYLOAD).fetch });

    expect((await search(app, SEARCH_LIMIT))?.status).toBe(200);
    expect((await search(app, 1))?.status).toBe(429);
  });

  // Three separate counters. A search burst while typing must not cost the forecast its
  // budget, and neither may touch sign-in — the one surface a lockout actually strands.
  it('spends each budget separately', async () => {
    const app = createApp({ weatherUpstream: stubUpstream(GEOCODING_PAYLOAD).fetch });

    await search(app, SEARCH_LIMIT + 1);

    // Not 200: this app is stubbed with a geocoding payload, so the forecast route answers
    // 503. Reaching its handler at all is the point — a shared counter would 429 first.
    expect((await forecast(app, 1))?.status).not.toBe(429);
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

  const res = await app.request('/v1/weather', post({ lat: '51.5', lon: '-0.13' }), env);

  const body = (await res.json()) as { current: { apparentTemperature: number | null } };
  expect(body.current.apparentTemperature).toBeNull();
});
