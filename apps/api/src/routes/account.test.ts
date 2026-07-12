import { env } from 'cloudflare:test';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  clockedStore,
  getChanges,
  postChanges,
  record,
  signedInToken,
} from '../__fixtures__/api-test-helpers.fixtures';
import type { AuthVars } from '../auth-middleware';
import { D1SyncStore } from '../d1-store';
import type { Env } from '../env';
import app, { createApp } from '../index';

type App = Hono<{ Bindings: Env } & AuthVars>;

async function getExport(token: string, appInstance: App = app) {
  return appInstance.request('/v1/export', { headers: { Authorization: `Bearer ${token}` } }, env);
}

async function deleteAccount(token: string, appInstance: App = app) {
  return appInstance.request(
    '/v1/account',
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    env
  );
}

describe('GET /v1/export', () => {
  it('returns pushed records, including tombstones', async () => {
    const { token } = await signedInToken();
    await postChanges(app, token, {
      records: [record({ entityId: 'a' }), record({ entityId: 'b', deleted: true })],
    });
    const res = await getExport(token);
    expect(res.status).toBe(200);
    const body = await res.json<{ records: Array<{ entityId: string; deleted: boolean }> }>();
    expect(body.records.map((r) => r.entityId)).toEqual(['a', 'b']);
    const tombstone = body.records.find((r) => r.entityId === 'b');
    if (tombstone === undefined) {
      throw new Error('expected tombstone record for entity b');
    }
    expect(tombstone.deleted).toBe(true);
  });
});

describe('DELETE /v1/account', () => {
  it('revokes the token and wipes user data; re-signing in starts with a fresh account', async () => {
    const { token, userId, providerSub } = await signedInToken();
    await postChanges(app, token, { records: [record({ entityId: 'a' })] });

    const del = await deleteAccount(token);
    expect(del.status).toBe(204);

    const afterDelete = await getChanges(app, token, '0');
    expect(afterDelete.status).toBe(401);
    const problemBody = await afterDelete.json<{ code: string }>();
    expect(problemBody.code).toBe('invalid_token');

    const store = new D1SyncStore(env.DB);
    const newUserId = await store.findOrCreateUser({ provider: 'dev', providerSub });
    expect(newUserId).not.toBe(userId);
    const newToken = await store.createSession(newUserId, 'test-device-2');

    const res = await getChanges(app, newToken, '0');
    expect(res.status).toBe(200);
    const freshBody = await res.json<{ records: unknown[]; cursor: number }>();
    expect(freshBody.records).toEqual([]);
    expect(freshBody.cursor).toBe(0);
  });
});

describe('per-user isolation across the full HTTP stack', () => {
  it('one user never sees another user changes via GET /v1/changes or /v1/export', async () => {
    const a = await signedInToken();
    const b = await signedInToken();
    await postChanges(app, a.token, {
      records: [record({ entityId: 'a-only', ciphertext: 'a-cipher' })],
    });
    await postChanges(app, b.token, {
      records: [record({ entityId: 'b-only', ciphertext: 'b-cipher' })],
    });

    const bChanges = await getChanges(app, b.token, '0');
    const bBody = await bChanges.json<{ records: Array<{ entityId: string }> }>();
    expect(bBody.records.map((r) => r.entityId)).toEqual(['b-only']);

    const bExport = await getExport(b.token);
    const bExportBody = await bExport.json<{ records: Array<{ entityId: string }> }>();
    expect(bExportBody.records.map((r) => r.entityId)).toEqual(['b-only']);
  });

  it('deleting one account leaves another user data fully intact (deleteUser blast radius)', async () => {
    const victim = await signedInToken();
    const survivor = await signedInToken();
    await postChanges(app, victim.token, { records: [record({ entityId: 'v1' })] });
    await postChanges(app, survivor.token, {
      records: [record({ entityId: 's1', ciphertext: 's1-cipher' })],
    });

    const del = await deleteAccount(victim.token);
    expect(del.status).toBe(204);

    // The survivor token and every one of their records must be untouched.
    const survivorChanges = await getChanges(app, survivor.token, '0');
    expect(survivorChanges.status).toBe(200);
    const body = await survivorChanges.json<{
      records: Array<{ entityId: string; ciphertext: string }>;
    }>();
    expect(body.records.map((r) => r.entityId)).toEqual(['s1']);
    expect(body.records[0]?.ciphertext).toBe('s1-cipher');
  });
});

describe('GET /v1/export auth', () => {
  it('returns 401 unauthorized with no Authorization header', async () => {
    const res = await app.request('/v1/export', {}, env);
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });

  it('returns 401 invalid_token with a garbage bearer token', async () => {
    const res = await getExport('garbage');
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });
});

describe('DELETE /v1/account auth', () => {
  it('returns 401 unauthorized with no Authorization header', async () => {
    const res = await app.request('/v1/account', { method: 'DELETE' }, env);
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });

  it('returns 401 invalid_token with a garbage bearer token', async () => {
    const res = await deleteAccount('garbage');
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });
});

describe('rate limiting on GET /v1/export', () => {
  it('blocks the 61st request in a window with 429 and Retry-After', async () => {
    const { store } = clockedStore(1_000);
    const rateLimitedApp = createApp({ storeFactory: () => store });
    const { token } = await signedInToken(store);

    let last: Response | undefined;
    for (let i = 1; i <= 60; i++) {
      last = await getExport(token, rateLimitedApp);
    }
    if (last === undefined) {
      throw new Error('expected a response from the loop');
    }
    expect(last.status).toBe(200);

    const blocked = await getExport(token, rateLimitedApp);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).not.toBeNull();
    const body = await blocked.json<{ code: string }>();
    expect(body.code).toBe('rate_limited');
  });

  // DELETE /v1/account shares this same perTokenRateLimit registration (index.ts); skipped
  // here since deleting the account mid-loop would revoke the token and confound the count.
});
