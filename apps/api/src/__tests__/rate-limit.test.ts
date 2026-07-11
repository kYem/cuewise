import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1SyncStore } from '../d1-store';
import { createApp } from '../index';
import { getChanges, signedInToken } from './__fixtures__/api-test-helpers.fixtures';

function clockedStore(now: number): { store: D1SyncStore; tick: (ms: number) => void } {
  let current = now;
  const store = new D1SyncStore(env.DB, () => current);
  return {
    store,
    tick: (ms) => {
      current += ms;
    },
  };
}

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
});
