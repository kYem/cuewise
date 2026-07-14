import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { isLocalhostOrigin, parseAllowedOrigins, resolveAllowedOrigin } from './cors';
import type { Env } from './env';
import app from './index';

const WEB_ORIGIN = 'https://app.cuewise.app';
const DEV_ORIGIN = 'http://localhost:1420';

function envWith(overrides: Partial<Env>): typeof env {
  return { ...env, ...overrides } as typeof env;
}

describe('parseAllowedOrigins', () => {
  it('returns an empty list for an undefined var', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it('splits, trims, and drops empty entries', () => {
    expect(parseAllowedOrigins(` ${WEB_ORIGIN} , ,https://x.dev `)).toEqual([
      WEB_ORIGIN,
      'https://x.dev',
    ]);
  });
});

describe('isLocalhostOrigin', () => {
  it('accepts http(s) loopback origins on any port', () => {
    expect(isLocalhostOrigin('http://localhost:1420')).toBe(true);
    expect(isLocalhostOrigin('https://localhost')).toBe(true);
    expect(isLocalhostOrigin('http://127.0.0.1:8787')).toBe(true);
    expect(isLocalhostOrigin('http://app.localhost:3000')).toBe(true);
  });

  it('rejects non-loopback, non-http, and malformed origins', () => {
    expect(isLocalhostOrigin('https://app.cuewise.app')).toBe(false);
    expect(isLocalhostOrigin('http://localhost.evil.com')).toBe(false);
    expect(isLocalhostOrigin('file://localhost')).toBe(false);
    expect(isLocalhostOrigin('not-a-url')).toBe(false);
  });
});

describe('resolveAllowedOrigin', () => {
  it('denies a missing origin (non-browser request)', () => {
    expect(resolveAllowedOrigin(undefined, envWith({}))).toBeNull();
    expect(resolveAllowedOrigin('', envWith({}))).toBeNull();
  });

  it('echoes an origin listed in ALLOWED_ORIGINS, with or without dev mode', () => {
    const withList = envWith({ ALLOWED_ORIGINS: `${WEB_ORIGIN},https://x.dev` });
    expect(resolveAllowedOrigin(WEB_ORIGIN, withList)).toBe(WEB_ORIGIN);
  });

  it('allows localhost only when DEV_FAKE_AUTH is on', () => {
    expect(resolveAllowedOrigin(DEV_ORIGIN, envWith({ DEV_FAKE_AUTH: '1' }))).toBe(DEV_ORIGIN);
    expect(resolveAllowedOrigin(DEV_ORIGIN, envWith({ DEV_FAKE_AUTH: undefined }))).toBeNull();
  });

  it('denies an unlisted non-localhost origin in production', () => {
    expect(
      resolveAllowedOrigin('https://evil.example', envWith({ ALLOWED_ORIGINS: WEB_ORIGIN }))
    ).toBeNull();
  });
});

describe('CORS middleware wiring', () => {
  it('answers a preflight OPTIONS from an allowed dev origin with 204 + CORS headers', async () => {
    const res = await app.request(
      '/v1/changes',
      {
        method: 'OPTIONS',
        headers: { Origin: DEV_ORIGIN, 'Access-Control-Request-Method': 'GET' },
      },
      envWith({ DEV_FAKE_AUTH: '1' })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(DEV_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('adds Access-Control-Allow-Origin to an actual response from an allowed origin', async () => {
    const res = await app.request(
      '/v1/health',
      { headers: { Origin: WEB_ORIGIN } },
      envWith({ ALLOWED_ORIGINS: WEB_ORIGIN })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(WEB_ORIGIN);
  });

  it('omits the CORS header for a disallowed origin', async () => {
    const res = await app.request(
      '/v1/health',
      { headers: { Origin: 'https://evil.example' } },
      envWith({ ALLOWED_ORIGINS: WEB_ORIGIN })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('does not allow localhost through CORS when DEV_FAKE_AUTH is off', async () => {
    const res = await app.request(
      '/v1/health',
      { headers: { Origin: DEV_ORIGIN } },
      envWith({ DEV_FAKE_AUTH: undefined })
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
