import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1SyncStore } from '../d1-store';
import app from '../index';
import {
  getChanges,
  postChanges,
  record,
  signedInToken,
} from './__fixtures__/api-test-helpers.fixtures';

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
