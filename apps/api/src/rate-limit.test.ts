import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { clockedStore, getChanges, signedInToken } from './__fixtures__/api-test-helpers.fixtures';
import { sha256Hex } from './crypto-utils';
import { D1SyncStore } from './d1-store';
import { createApp } from './index';

describe('rate limiting on /v1/changes', () => {
  it('allows up to 60 requests per window then blocks the 61st with 429 and Retry-After', async () => {
    const { store } = clockedStore(1_000);
    const app = createApp({ storeFactory: () => store });
    const { token } = await signedInToken(store);

    let last: Response | undefined;
    for (let i = 1; i <= 60; i++) {
      const res = await getChanges(app, token);
      if (i === 1) {
        expect(res.status).toBe(200);
      }
      last = res;
    }
    if (last === undefined) {
      throw new Error('expected a response from the loop');
    }
    expect(last.status).toBe(200);

    const blocked = await getChanges(app, token);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).not.toBeNull();
    const body = await blocked.json<{ code: string; retryAfter: number }>();
    expect(body.code).toBe('rate_limited');
    expect(typeof body.retryAfter).toBe('number');
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('admits requests again once the injected clock advances past the window', async () => {
    const { store, tick } = clockedStore(1_000);
    const app = createApp({ storeFactory: () => store });
    const { token } = await signedInToken(store);

    for (let i = 1; i <= 60; i++) {
      await getChanges(app, token);
    }
    const blocked = await getChanges(app, token);
    expect(blocked.status).toBe(429);

    tick(61_000);
    const res = await getChanges(app, token);
    expect(res.status).toBe(200);
  });

  it('reports the exact retryAfter derived from the store clock, not wall-clock time', async () => {
    const { store, tick } = clockedStore(100_000);
    const app = createApp({ storeFactory: () => store });
    const { token } = await signedInToken(store);

    for (let i = 1; i <= 60; i++) {
      await getChanges(app, token);
    }
    // Window opened at t=100_000 with a 60s window; blocking 30s later must report 30s left.
    tick(30_000);
    const blocked = await getChanges(app, token);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('30');
    const body = await blocked.json<{ retryAfter: number }>();
    expect(body.retryAfter).toBe(30);
  });
});

describe('bumpRateWindow', () => {
  it('returns null when the token row no longer exists', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await store.findOrCreateUser({
      provider: 'dev',
      providerSub: 'vanished-token',
    });
    const token = await store.createSession(userId, 'device');
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare('DELETE FROM tokens WHERE token_hash = ?').bind(tokenHash).run();

    const result = await store.bumpRateWindow(tokenHash, 60_000);
    expect(result).toBeNull();
  });
});

// requireSession's own lookupSession already 401s a deleted-token row before rateLimit ever
// runs, so a real deleted row can't isolate rateLimit's null branch. A store stub that keeps
// lookupSession working but forces bumpRateWindow to null drives that branch directly instead.
class NullRateWindowStore extends D1SyncStore {
  async bumpRateWindow(): Promise<{ count: number; resetInMs: number } | null> {
    return null;
  }
}

describe('rateLimit middleware null branch (HTTP-level)', () => {
  it('returns 401 invalid_token, not a 500, when bumpRateWindow returns null', async () => {
    const store = new NullRateWindowStore(env.DB);
    const app = createApp({ storeFactory: () => store });
    const { token } = await signedInToken(store);

    const res = await getChanges(app, token);

    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });
});
