import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { spyOnLoggerWarn } from './__fixtures__/logger.fixtures';
import type { AuthVars } from './auth-middleware';
import type { Env } from './env';
import { createApp } from './index';
import { type IpRateLimitOptions, ipRateLimit } from './ip-rate-limit';

type App = Hono<{ Bindings: Env } & AuthVars>;

function testEnv(): typeof env {
  return { ...env, DEV_FAKE_AUTH: '1' };
}

async function postToken(app: App, ip: string): Promise<Response> {
  return app.request(
    '/v1/auth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({
        provider: 'dev',
        credential: 'ip-rate-limit-test-user',
        deviceName: 'ip-rate-limit-test',
      }),
    },
    testEnv()
  );
}

function appleTestEnv(): typeof env {
  return {
    ...env,
    STATE_SIGNING_KEY: 'ip-rate-limit-apple-signing-key',
    ALLOWED_RETURN_URIS: 'cuewise://auth',
  };
}

async function getAppleStart(app: App, ip: string): Promise<Response> {
  const params = new URLSearchParams({
    return_uri: 'cuewise://auth',
    code_challenge: 'a'.repeat(43),
  });
  return app.request(
    `/v1/auth/apple/start?${params.toString()}`,
    { headers: { 'CF-Connecting-IP': ip } },
    appleTestEnv()
  );
}

async function postTokenWithoutIpHeader(app: App): Promise<Response> {
  return app.request(
    '/v1/auth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'dev',
        credential: 'ip-rate-limit-test-user-no-ip',
        deviceName: 'ip-rate-limit-test',
      }),
    },
    testEnv()
  );
}

/** A bare app with `ipRateLimit(opts)` as the only middleware, for exercising window/eviction directly. */
function appWithLimiter(opts: IpRateLimitOptions): App {
  const app: App = new Hono();
  app.use('/probe', ipRateLimit(opts));
  app.get('/probe', (c) => c.text('ok'));
  return app;
}

async function probe(app: App, ip: string): Promise<Response> {
  return app.request('/probe', { headers: { 'CF-Connecting-IP': ip } }, testEnv());
}

async function probeWithoutIp(app: App): Promise<Response> {
  return app.request('/probe', {}, testEnv());
}

describe('IP rate limiting on the auth surface', () => {
  it('blocks the 31st POST /v1/auth/token from one IP with 429 and Retry-After', async () => {
    const app = createApp();
    const ip = '203.0.113.10';

    let last: Response | undefined;
    for (let i = 1; i <= 30; i++) {
      last = await postToken(app, ip);
    }
    if (last === undefined) {
      throw new Error('expected a response from the loop');
    }
    expect(last.status).toBe(200);

    const blocked = await postToken(app, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).not.toBeNull();
    const body = await blocked.json<{ code: string; retryAfter: number }>();
    expect(body.code).toBe('rate_limited');
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('does not rate limit a different IP once the first IP is blocked', async () => {
    const app = createApp();
    const blockedIp = '203.0.113.11';
    const otherIp = '203.0.113.12';

    for (let i = 1; i <= 31; i++) {
      await postToken(app, blockedIp);
    }

    const res = await postToken(app, otherIp);
    expect(res.status).toBe(200);
  });

  it('does not rate limit requests missing CF-Connecting-IP (31 consecutive requests all succeed)', async () => {
    const app = createApp();

    for (let i = 1; i <= 31; i++) {
      const res = await postTokenWithoutIpHeader(app);
      expect(res.status).toBe(200);
    }
  });

  it('blocks the 31st GET /v1/auth/apple/start from one IP with 429', async () => {
    const app = createApp();
    const ip = '203.0.113.30';

    let last: Response | undefined;
    for (let i = 1; i <= 30; i++) {
      last = await getAppleStart(app, ip);
    }
    if (last === undefined) {
      throw new Error('expected a response from the loop');
    }
    expect(last.status).toBe(302);

    const blocked = await getAppleStart(app, ip);
    expect(blocked.status).toBe(429);
    const body = await blocked.json<{ code: string }>();
    expect(body.code).toBe('rate_limited');
  });
});

describe('ipRateLimit generation-based window', () => {
  it('admits a previously-blocked IP again once the injected clock advances past the window', async () => {
    let current = 1_000;
    const app = appWithLimiter({ limit: 2, windowMs: 1_000, now: () => current });
    const ip = '203.0.113.20';

    await probe(app, ip);
    await probe(app, ip);
    const blocked = await probe(app, ip);
    expect(blocked.status).toBe(429);

    current += 1_000;
    const res = await probe(app, ip);
    expect(res.status).toBe(200);
  });

  it('does not let a flood of new IPs reset an already-throttled IP within the same window', async () => {
    const app = appWithLimiter({ limit: 1, windowMs: 60_000, maxTrackedIps: 3 });
    const throttledIp = '203.0.113.21';

    await probe(app, throttledIp);
    const blocked = await probe(app, throttledIp);
    expect(blocked.status).toBe(429);

    // Flood with more distinct IPs than maxTrackedIps, trying to evict the throttled IP's entry.
    for (let i = 0; i < 10; i++) {
      await probe(app, `203.0.113.${100 + i}`);
    }

    const stillBlocked = await probe(app, throttledIp);
    expect(stillBlocked.status).toBe(429);
  });
});

describe('ipRateLimit missing-IP warn dedupe', () => {
  it('warns once per window for repeated requests missing CF-Connecting-IP, then again after the window rolls', async () => {
    let current = 1_000;
    const app = appWithLimiter({ limit: 30, windowMs: 1_000, now: () => current });
    const warnSpy = spyOnLoggerWarn();

    for (let i = 0; i < 5; i++) {
      const res = await probeWithoutIp(app);
      expect(res.status).toBe(200);
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);

    current += 1_000;
    await probeWithoutIp(app);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
