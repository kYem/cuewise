import { describe, expect, it } from 'vitest';
import app from '../index';
import {
  getChanges,
  postChanges,
  record,
  signedInToken,
} from './__fixtures__/api-test-helpers.fixtures';

describe('POST /v1/changes then GET /v1/changes', () => {
  it('pushes two records and returns cursor 2', async () => {
    const { token } = await signedInToken();
    const res = await postChanges(app, token, {
      records: [record({ entityId: 'a' }), record({ entityId: 'b' })],
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ cursor: number }>();
    expect(body).toEqual({ cursor: 2 });
  });

  it('GET since=0 returns both pushed records with round-tripped fields', async () => {
    const { token } = await signedInToken();
    await postChanges(app, token, {
      records: [
        record({ entityId: 'a', ciphertext: 'cipher-a' }),
        record({ entityId: 'b', ciphertext: 'cipher-b' }),
      ],
    });
    const res = await getChanges(app, token, '0');
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
    await postChanges(app, token, {
      records: [record({ entityId: 'a' }), record({ entityId: 'b' })],
    });
    const res = await getChanges(app, token, '2');
    expect(res.status).toBe(200);
    const body = await res.json<{ records: unknown[]; cursor: number }>();
    expect(body.records).toEqual([]);
    expect(body.cursor).toBe(2);
  });
});

describe('GET /v1/changes cursor validation', () => {
  it('rejects a non-numeric since with 400 invalid_cursor', async () => {
    const { token } = await signedInToken();
    const res = await getChanges(app, token, 'abc');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_cursor');
  });

  it('rejects a negative since with 400 invalid_cursor', async () => {
    const { token } = await signedInToken();
    const res = await getChanges(app, token, '-1');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_cursor');
  });

  it('rejects scientific notation since=1e5 with 400 invalid_cursor', async () => {
    const { token } = await signedInToken();
    const res = await getChanges(app, token, '1e5');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_cursor');
  });

  it('rejects a since with trailing junk (123abc) with 400 invalid_cursor', async () => {
    const { token } = await signedInToken();
    const res = await getChanges(app, token, '123abc');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_cursor');
  });
});

describe('POST /v1/changes batch cap', () => {
  it('rejects a batch of 101 records with 422 batch_too_large', async () => {
    const { token } = await signedInToken();
    const records = Array.from({ length: 101 }, (_, i) => record({ entityId: `entity-${i}` }));
    const res = await postChanges(app, token, { records });
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
    const res = await postChanges(app, token, { records: [missingEntityId, oversizedCiphertext] });
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
    const res = await postChanges(app, token, '{not json');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
  });
});

describe('POST /v1/changes idempotent retry', () => {
  it('re-pushing an identical batch succeeds and GET returns the entity once at the latest seq', async () => {
    const { token } = await signedInToken();
    const batch = { records: [record({ entityId: 'a', ciphertext: 'cipher-a' })] };
    const first = await postChanges(app, token, batch);
    expect(first.status).toBe(200);
    const second = await postChanges(app, token, batch);
    expect(second.status).toBe(200);
    const secondBody = await second.json<{ cursor: number }>();
    expect(secondBody.cursor).toBe(2);
    const res = await getChanges(app, token, '0');
    const body = await res.json<{ records: Array<{ entityId: string; ciphertext: string }> }>();
    expect(body.records).toHaveLength(1);
    expect(body.records[0]?.entityId).toBe('a');
    expect(body.records[0]?.ciphertext).toBe('cipher-a');
  });
});
