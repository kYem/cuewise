import { env } from 'cloudflare:test';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { createApp } from '../index';

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
});
