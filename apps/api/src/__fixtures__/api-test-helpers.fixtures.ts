import { env } from 'cloudflare:test';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { RawSessionToken } from '../crypto-utils';
import { D1SyncStore } from '../d1-store';
import type { Env } from '../env';
import type { PushRecord } from '../store';

type App = Hono<{ Bindings: Env } & AuthVars>;

export async function signedInToken(
  store: D1SyncStore = new D1SyncStore(env.DB)
): Promise<{ token: RawSessionToken; userId: string; providerSub: string }> {
  const providerSub = `u-${crypto.randomUUID()}`;
  const userId = await store.findOrCreateUser({ provider: 'dev', providerSub });
  const token = await store.createSession(userId, 'test-device');
  return { token, userId, providerSub };
}

export function record(overrides: Partial<PushRecord> = {}): PushRecord {
  return {
    collection: 'quotes',
    entityId: 'entity-1',
    ciphertext: 'cipher-1',
    clientUpdatedAt: 1_000,
    deleted: false,
    ...overrides,
  };
}

/** A D1SyncStore whose clock is driven by `tick` instead of wall time, for TTL/window tests. */
export function clockedStore(now: number): { store: D1SyncStore; tick: (ms: number) => void } {
  let current = now;
  const store = new D1SyncStore(env.DB, () => current);
  return {
    store,
    tick: (ms) => {
      current += ms;
    },
  };
}

export async function getChanges(app: App, token: string, since = '0'): Promise<Response> {
  return app.request(
    `/v1/changes?since=${since}`,
    { headers: { Authorization: `Bearer ${token}` } },
    env
  );
}

export async function postChanges(app: App, token: string, body: unknown): Promise<Response> {
  return app.request(
    '/v1/changes',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env
  );
}
