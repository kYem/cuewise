import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1SyncStore } from '../d1-store';
import app from '../index';
import type { PushRecord } from '../store';

async function signedInToken(): Promise<{ token: string; userId: string }> {
  const store = new D1SyncStore(env.DB);
  const userId = await store.findOrCreateUser({
    provider: 'dev',
    providerSub: `u-${crypto.randomUUID()}`,
  });
  const token = await store.createSession(userId, 'test-device');
  return { token, userId };
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

describe('POST /v1/changes then GET /v1/changes', () => {
  it('pushes two records and returns cursor 2', async () => {
    const { token } = await signedInToken();
    const res = await postChanges(token, {
      records: [record({ entityId: 'a' }), record({ entityId: 'b' })],
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ cursor: number }>();
    expect(body).toEqual({ cursor: 2 });
  });

  it('GET since=0 returns both pushed records with round-tripped fields', async () => {
    const { token } = await signedInToken();
    await postChanges(token, {
      records: [
        record({ entityId: 'a', ciphertext: 'cipher-a' }),
        record({ entityId: 'b', ciphertext: 'cipher-b' }),
      ],
    });
    const res = await getChanges(token, '0');
    expect(res.status).toBe(200);
    const body = await res.json<{
      records: Array<{ entityId: string; ciphertext: string }>;
      cursor: number;
    }>();
    expect(body.records.map((r) => r.entityId)).toEqual(['a', 'b']);
    expect(body.records.map((r) => r.ciphertext)).toEqual(['cipher-a', 'cipher-b']);
    expect(body.cursor).toBe(2);
  });

  it('GET since=2 returns no records and cursor unchanged at 2', async () => {
    const { token } = await signedInToken();
    await postChanges(token, { records: [record({ entityId: 'a' }), record({ entityId: 'b' })] });
    const res = await getChanges(token, '2');
    expect(res.status).toBe(200);
    const body = await res.json<{ records: unknown[]; cursor: number }>();
    expect(body.records).toEqual([]);
    expect(body.cursor).toBe(2);
  });
});

describe('GET /v1/changes cursor validation', () => {
  it('rejects a non-numeric since with 400 invalid_cursor', async () => {
    const { token } = await signedInToken();
    const res = await getChanges(token, 'abc');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_cursor');
  });

  it('rejects a negative since with 400 invalid_cursor', async () => {
    const { token } = await signedInToken();
    const res = await getChanges(token, '-1');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_cursor');
  });
});

describe('POST /v1/changes batch cap', () => {
  it('rejects a batch of 101 records with 422 batch_too_large', async () => {
    const { token } = await signedInToken();
    const records = Array.from({ length: 101 }, (_, i) => record({ entityId: `entity-${i}` }));
    const res = await postChanges(token, { records });
    expect(res.status).toBe(422);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('batch_too_large');
  });
});

describe('POST /v1/changes record validation', () => {
  it('collects all violations across all records in one response', async () => {
    const { token } = await signedInToken();
    const invalidRecord = record();
    const missingEntityId = { ...invalidRecord, entityId: undefined };
    const oversizedCiphertext = record({ ciphertext: 'x'.repeat(65537) });
    const res = await postChanges(token, { records: [missingEntityId, oversizedCiphertext] });
    expect(res.status).toBe(422);
    const body = await res.json<{
      code: string;
      errors: Array<{ index: number; pointer: string }>;
    }>();
    expect(body.code).toBe('invalid_record');
    expect(body.errors).toHaveLength(2);
    expect(body.errors[0]?.index).toBe(0);
    expect(body.errors[0]?.pointer).toBe('/records/0/entityId');
    expect(body.errors[1]?.index).toBe(1);
    expect(body.errors[1]?.pointer).toBe('/records/1/ciphertext');
  });

  it('rejects unparseable JSON body with 400 invalid_request', async () => {
    const { token } = await signedInToken();
    const res = await postChanges(token, '{not json');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
  });
});

describe('POST /v1/changes idempotent retry', () => {
  it('re-pushing an identical batch succeeds and GET returns the entity once at the latest seq', async () => {
    const { token } = await signedInToken();
    const batch = { records: [record({ entityId: 'a', ciphertext: 'cipher-a' })] };
    const first = await postChanges(token, batch);
    expect(first.status).toBe(200);
    const second = await postChanges(token, batch);
    expect(second.status).toBe(200);
    const secondBody = await second.json<{ cursor: number }>();
    expect(secondBody.cursor).toBe(2);
    const res = await getChanges(token, '0');
    const body = await res.json<{ records: Array<{ entityId: string; ciphertext: string }> }>();
    expect(body.records).toHaveLength(1);
    expect(body.records[0]?.entityId).toBe('a');
    expect(body.records[0]?.ciphertext).toBe('cipher-a');
  });
});
