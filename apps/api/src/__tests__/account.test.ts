import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1SyncStore } from '../d1-store';
import app from '../index';
import type { PushRecord } from '../store';

async function signedInToken(): Promise<{ token: string; userId: string; providerSub: string }> {
  const providerSub = `u-${crypto.randomUUID()}`;
  const store = new D1SyncStore(env.DB);
  const userId = await store.findOrCreateUser({ provider: 'dev', providerSub });
  const token = await store.createSession(userId, 'test-device');
  return { token, userId, providerSub };
}

function record(overrides: Partial<PushRecord> = {}): PushRecord {
  return {
    collection: 'quotes',
    entityId: 'entity-1',
    ciphertext: 'cipher-1',
    clientUpdatedAt: 1_000,
    deleted: false,
    ...overrides,
  };
}

async function getChanges(token: string, since: string) {
  return app.request(
    `/v1/changes?since=${since}`,
    { headers: { Authorization: `Bearer ${token}` } },
    env
  );
}

async function postChanges(token: string, body: unknown) {
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

async function getExport(token: string) {
  return app.request('/v1/export', { headers: { Authorization: `Bearer ${token}` } }, env);
}

async function deleteAccount(token: string) {
  return app.request(
    '/v1/account',
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    env
  );
}

describe('GET /v1/export', () => {
  it('returns pushed records, including tombstones', async () => {
    const { token } = await signedInToken();
    await postChanges(token, {
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
    await postChanges(token, { records: [record({ entityId: 'a' })] });

    const del = await deleteAccount(token);
    expect(del.status).toBe(204);

    const afterDelete = await getChanges(token, '0');
    expect(afterDelete.status).toBe(401);
    const problemBody = await afterDelete.json<{ code: string }>();
    expect(problemBody.code).toBe('invalid_token');

    const store = new D1SyncStore(env.DB);
    const newUserId = await store.findOrCreateUser({ provider: 'dev', providerSub });
    expect(newUserId).not.toBe(userId);
    const newToken = await store.createSession(newUserId, 'test-device-2');

    const res = await getChanges(newToken, '0');
    expect(res.status).toBe(200);
    const freshBody = await res.json<{ records: unknown[]; cursor: number }>();
    expect(freshBody.records).toEqual([]);
    expect(freshBody.cursor).toBe(0);
  });
});
