import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemResponse, stubFetch } from './__fixtures__/fetch.fixtures';
import { ApiClient } from './api-client';
import type { PushRecord } from './types';

const BASE_URL = 'https://api.cuewise.app';
const TOKEN = 'session-token-123';

/** Stand-in key material: these tests assert placement on the wire, not that it is real base64url. */
function wire<T extends string>(value: string): T {
  return value as T;
}

const pushRecordFixture: PushRecord = {
  collection: 'quotes',
  entityId: 'q1',
  ciphertext: 'ciphertext-blob',
  clientUpdatedAt: 1_700_000_000_000,
  deleted: false,
};

describe('ApiClient', () => {
  it('performs GET {baseUrl}/v1/changes?since=0 with the bearer header and returns the parsed body', async () => {
    const body = {
      records: [{ ...pushRecordFixture, seq: 1 }],
      cursor: 1,
    };
    const { fetchFn, calls } = stubFetch([{ status: 200, body }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    const result = await client.getChanges(0);

    expect(result).toEqual(body);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE_URL}/v1/changes?since=0`);
    expect(calls[0].init.method).toBe('GET');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('POSTs { records } to /v1/changes and returns { cursor }', async () => {
    const { fetchFn, calls } = stubFetch([{ status: 200, body: { cursor: 5 } }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    const result = await client.pushChanges([pushRecordFixture]);

    expect(result).toEqual({ cursor: 5 });
    expect(calls[0].url).toBe(`${BASE_URL}/v1/changes`);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ records: [pushRecordFixture] });
  });

  it('GETs /v1/export and returns the records alongside their key envelopes', async () => {
    const body = {
      records: [{ ...pushRecordFixture, seq: 1 }],
      keyEnvelopes: [
        { kind: 'recovery', envelope: 'v1.dk-1.aaaa.bbbb', updatedAt: 1_700_000_000_000 },
      ],
    };
    const { fetchFn, calls } = stubFetch([{ status: 200, body }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    const result = await client.exportData();

    expect(result.keyEnvelopes).toEqual(body.keyEnvelopes);
    expect(calls[0].url).toBe(`${BASE_URL}/v1/export`);
    expect(calls[0].init.method).toBe('GET');
  });

  // Regression: the extension service worker (WorkerGlobalScope) rejects fetch called with any
  // receiver but the global, so the default fetchFn must be bound to globalThis.
  describe('default fetch binding', () => {
    let originalFetch: typeof fetch;
    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('binds the default fetch to the global scope so a worker realm accepts it', async () => {
      const guardedFetch = function (this: unknown): Promise<Response> {
        if (this !== globalThis) {
          return Promise.reject(new TypeError("Failed to execute 'fetch': Illegal invocation"));
        }
        return Promise.resolve(new Response(JSON.stringify({ token: 'ok' }), { status: 200 }));
      };
      globalThis.fetch = guardedFetch as typeof fetch;
      const client = new ApiClient({
        baseUrl: BASE_URL,
        getToken: async () => null,
        sleep: async () => undefined,
      });

      await expect(
        client.exchangeToken({ provider: 'google', credential: 'id-token', deviceName: 'Device A' })
      ).resolves.toEqual({ token: 'ok' });
    });
  });

  it('getAccount performs an authed GET /v1/account and returns the parsed body', async () => {
    const body = { userId: 'user-1', email: 'kes@example.com' };
    const { fetchFn, calls } = stubFetch([{ status: 200, body }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    const result = await client.getAccount();

    expect(result).toEqual(body);
    expect(calls[0].url).toBe(`${BASE_URL}/v1/account`);
    expect(calls[0].init.method).toBe('GET');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('folds a detail-less errors[] body into the message so logs stay diagnostic', async () => {
    const { fetchFn } = stubFetch([
      problemResponse('invalid_request', 400, {
        errors: [
          { pointer: '/codeVerifier', detail: 'must be at least 43 characters' },
          { pointer: '/deviceName', detail: 'required non-empty string' },
        ],
      }),
    ]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    await expect(
      client.exchangeToken({ provider: 'google', credential: 'id-token', deviceName: 'd' })
    ).rejects.toMatchObject({
      code: 'invalid_request',
      message:
        '/codeVerifier must be at least 43 characters; /deviceName required non-empty string',
    });
  });

  it('rejects with a non-retryable ApiError when the server returns 422 invalid_record', async () => {
    const errors = [
      { index: 0, pointer: '/records/0/collection', detail: 'required non-empty string' },
    ];
    const { fetchFn } = stubFetch([problemResponse('invalid_record', 422, { errors })]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    await expect(client.pushChanges([pushRecordFixture])).rejects.toMatchObject({
      code: 'invalid_record',
      retryable: false,
      errors,
    });
  });

  it('retries once after a 429 and honors retryAfter (seconds) converted to ms', async () => {
    const { fetchFn, calls } = stubFetch([
      problemResponse('rate_limited', 429, { retryAfter: 30 }),
      { status: 200, body: { records: [], cursor: 10 } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new ApiClient({
      baseUrl: BASE_URL,
      getToken: async () => TOKEN,
      fetchFn,
      sleep,
    });

    const result = await client.getChanges(0);

    expect(result).toEqual({ records: [], cursor: 10 });
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it('gives up after 4 total attempts (1 + 3 retries) on persistent 500s', async () => {
    const { fetchFn, calls } = stubFetch([
      problemResponse('internal', 500),
      problemResponse('internal', 500),
      problemResponse('internal', 500),
      problemResponse('internal', 500),
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new ApiClient({
      baseUrl: BASE_URL,
      getToken: async () => TOKEN,
      fetchFn,
      sleep,
    });

    await expect(client.getChanges(0)).rejects.toMatchObject({ code: 'internal' });
    expect(calls).toHaveLength(4);
  });

  it('exchangeToken sends no Authorization header even when getToken resolves a token', async () => {
    const { fetchFn, calls } = stubFetch([{ status: 200, body: { token: 'new-session-token' } }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    const result = await client.exchangeToken({
      provider: 'google',
      credential: 'google-credential',
      deviceName: 'MacBook Pro',
    });

    expect(result).toEqual({ token: 'new-session-token' });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('exchangeToken for apple against a 500 rejects with code internal after exactly one attempt', async () => {
    const { fetchFn, calls } = stubFetch([problemResponse('internal', 500)]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    await expect(
      client.exchangeToken({
        provider: 'apple',
        credential: 'apple-code',
        deviceName: 'd',
        codeVerifier: 'verifier',
      })
    ).rejects.toMatchObject({ code: 'internal' });
    expect(calls).toHaveLength(1);
  });

  it('exchangeToken for apple against a rejecting fetch rejects with network_error after exactly one attempt', async () => {
    const { fetchFn, calls } = stubFetch([{ reject: true }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    await expect(
      client.exchangeToken({
        provider: 'apple',
        credential: 'apple-code',
        deviceName: 'd',
        codeVerifier: 'verifier',
      })
    ).rejects.toMatchObject({ code: 'network_error' });
    expect(calls).toHaveLength(1);
  });

  it('exchangeToken for google retries a 500 and resolves after the retry (2 calls)', async () => {
    const { fetchFn, calls } = stubFetch([
      problemResponse('internal', 500),
      { status: 200, body: { token: 'new-session-token' } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new ApiClient({
      baseUrl: BASE_URL,
      getToken: async () => TOKEN,
      fetchFn,
      sleep,
    });

    const result = await client.exchangeToken({
      provider: 'google',
      credential: 'google-credential',
      deviceName: 'd',
    });

    expect(result).toEqual({ token: 'new-session-token' });
    expect(calls).toHaveLength(2);
  });

  it('exchangeToken for google with a codeVerifier (bounced code) never retries a 500', async () => {
    const { fetchFn, calls } = stubFetch([problemResponse('internal', 500)]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    await expect(
      client.exchangeToken({
        provider: 'google',
        credential: 'bounced-code',
        deviceName: 'd',
        codeVerifier: 'verifier',
      })
    ).rejects.toMatchObject({ code: 'internal' });
    expect(calls).toHaveLength(1);
  });

  it('retries through two network-level rejections and resolves on the third attempt', async () => {
    const { fetchFn, calls } = stubFetch([
      { reject: true },
      { reject: true },
      { status: 200, body: { records: [], cursor: 3 } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new ApiClient({
      baseUrl: BASE_URL,
      getToken: async () => TOKEN,
      fetchFn,
      sleep,
    });

    const result = await client.getChanges(0);

    expect(result).toEqual({ records: [], cursor: 3 });
    expect(calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 1000);
  });

  it('rejects with a retryable network_error ApiError after 4 total attempts on persistent rejections', async () => {
    const { fetchFn, calls } = stubFetch([
      { reject: true },
      { reject: true },
      { reject: true },
      { reject: true },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new ApiClient({
      baseUrl: BASE_URL,
      getToken: async () => TOKEN,
      fetchFn,
      sleep,
    });

    await expect(client.getChanges(0)).rejects.toMatchObject({
      code: 'network_error',
      retryable: true,
    });
    expect(calls).toHaveLength(4);
  });

  it('rejects with a non-retryable invalid_response ApiError when a 200 body fails to parse', async () => {
    const { fetchFn } = stubFetch([{ status: 200, rawBody: 'not-json{' }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    await expect(client.getChanges(0)).rejects.toMatchObject({
      code: 'invalid_response',
      retryable: false,
    });
  });

  it('treats a literal `null` JSON error body as internal (not a retried network_error)', async () => {
    // A proxy returning the JSON `null` parses fine, so reading `.code` off it used to throw and
    // get mis-folded into a retryable network_error; it must stay the real non-retryable 400.
    const { fetchFn, calls } = stubFetch([{ status: 400, body: null }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    await expect(client.getChanges(0)).rejects.toMatchObject({
      code: 'internal',
      status: 400,
      retryable: false,
    });
    expect(calls).toHaveLength(1);
  });

  it('honors a Retry-After header when a 429 carries a non-JSON body (no retryAfter in body)', async () => {
    const { fetchFn, calls } = stubFetch([
      { status: 429, rawBody: 'Too Many Requests', headers: { 'Retry-After': '60' } },
      { status: 200, body: { records: [], cursor: 7 } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new ApiClient({
      baseUrl: BASE_URL,
      getToken: async () => TOKEN,
      fetchFn,
      sleep,
    });

    const result = await client.getChanges(0);

    expect(result).toEqual({ records: [], cursor: 7 });
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it('ignores a non-positive Retry-After header and falls back to exponential backoff', async () => {
    const { fetchFn } = stubFetch([
      { status: 429, rawBody: 'slow down', headers: { 'Retry-After': '-5' } },
      { status: 200, body: { records: [], cursor: 1 } },
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new ApiClient({
      baseUrl: BASE_URL,
      getToken: async () => TOKEN,
      fetchFn,
      sleep,
    });

    await client.getChanges(0);

    // -5 must not become setTimeout(-5000)→immediate; it falls back to 2**0 * 500.
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('preserves the original thrown error as ApiError.cause on a network failure', async () => {
    const { fetchFn } = stubFetch([{ reject: true }]);
    const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

    await expect(
      client.exchangeToken({
        provider: 'apple',
        credential: 'apple-code',
        deviceName: 'd',
        codeVerifier: 'verifier',
      })
    ).rejects.toMatchObject({ code: 'network_error', cause: expect.any(TypeError) });
  });

  describe('recovery envelope', () => {
    it('getRecoveryEnvelope returns the parsed body on 200', async () => {
      const body = { envelope: 'v1.dk-1.a.b', updatedAt: 123 };
      const { fetchFn, calls } = stubFetch([{ status: 200, body }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      const result = await client.getRecoveryEnvelope();

      expect(result).toEqual(body);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${BASE_URL}/v1/keys/recovery`);
      expect(calls[0].init.method).toBe('GET');
      const headers = new Headers(calls[0].init.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('getRecoveryEnvelope returns null on 404 instead of throwing', async () => {
      const { fetchFn, calls } = stubFetch([problemResponse('not_found', 404)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      const result = await client.getRecoveryEnvelope();

      expect(result).toBeNull();
      expect(calls).toHaveLength(1);
    });

    it('getRecoveryEnvelope still throws ApiError on 500', async () => {
      const { fetchFn, calls } = stubFetch([
        problemResponse('internal', 500),
        problemResponse('internal', 500),
        problemResponse('internal', 500),
        problemResponse('internal', 500),
      ]);
      const sleep = vi.fn().mockResolvedValue(undefined);
      const client = new ApiClient({
        baseUrl: BASE_URL,
        getToken: async () => TOKEN,
        fetchFn,
        sleep,
      });

      await expect(client.getRecoveryEnvelope()).rejects.toMatchObject({
        code: 'internal',
        status: 500,
      });
      expect(calls).toHaveLength(4);
    });

    it('putRecoveryEnvelope PUTs the envelope and resolves on 204', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 204 }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.putRecoveryEnvelope('v1.dk-1.a.b')).resolves.toBeUndefined();

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${BASE_URL}/v1/keys/recovery`);
      expect(calls[0].init.method).toBe('PUT');
      expect(JSON.parse(calls[0].init.body as string)).toEqual({ envelope: 'v1.dk-1.a.b' });
    });

    it('putRecoveryEnvelope throws ApiError on 400', async () => {
      const { fetchFn, calls } = stubFetch([problemResponse('invalid_key_envelope', 400)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.putRecoveryEnvelope('bad-envelope')).rejects.toMatchObject({
        code: 'invalid_key_envelope',
        retryable: false,
      });
      expect(calls).toHaveLength(1);
    });

    it('putRecoveryEnvelope with ifAbsent:true sends the flag and resolves on 204', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 204 }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(
        client.putRecoveryEnvelope('v1.dk-1.a.b', { ifAbsent: true })
      ).resolves.toBeUndefined();

      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0].init.body as string)).toEqual({
        envelope: 'v1.dk-1.a.b',
        ifAbsent: true,
      });
    });

    it('putRecoveryEnvelope with ifAbsent:true throws key_envelope_exists on 409, no retry', async () => {
      const { fetchFn, calls } = stubFetch([problemResponse('key_envelope_exists', 409)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(
        client.putRecoveryEnvelope('v1.dk-1.a.b', { ifAbsent: true })
      ).rejects.toMatchObject({
        code: 'key_envelope_exists',
        status: 409,
        retryable: false,
      });
      expect(calls).toHaveLength(1);
    });
  });

  describe('sessions', () => {
    const sessionFixture = {
      id: 's1',
      deviceName: 'laptop',
      createdAt: 1,
      lastUsedAt: 2,
      current: true,
    };

    it('GETs /v1/sessions and unwraps the sessions array', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 200, body: { sessions: [sessionFixture] } }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      const sessions = await client.listSessions();

      expect(sessions).toEqual([sessionFixture]);
      expect(calls[0].url).toBe(`${BASE_URL}/v1/sessions`);
      expect(calls[0].init.method).toBe('GET');
    });

    it('DELETEs the addressed session', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 204 }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await client.revokeSession('s1');

      expect(calls[0].url).toBe(`${BASE_URL}/v1/sessions/s1`);
      expect(calls[0].init.method).toBe('DELETE');
    });

    it('PATCHes the new device name', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 204 }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await client.renameSession('s1', 'Work MacBook');

      expect(calls[0].url).toBe(`${BASE_URL}/v1/sessions/s1`);
      expect(calls[0].init.method).toBe('PATCH');
      expect(JSON.parse(calls[0].init.body as string)).toEqual({ deviceName: 'Work MacBook' });
    });

    it('POSTs revoke-others and returns the count', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 200, body: { revoked: 3 } }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      const revoked = await client.revokeOtherSessions();

      expect(revoked).toBe(3);
      expect(calls[0].url).toBe(`${BASE_URL}/v1/sessions/revoke-others`);
      expect(calls[0].init.method).toBe('POST');
    });

    it('surfaces a 404 revoke as a typed ApiError', async () => {
      const { fetchFn } = stubFetch([problemResponse('not_found', 404)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.revokeSession('gone')).rejects.toMatchObject({
        code: 'not_found',
        status: 404,
        retryable: false,
      });
    });
  });

  describe('pairings', () => {
    const pairingCreatedFixture = { id: 'p1', expiresAt: 1_700_000_600_000 };
    const pendingPairingFixture = {
      id: 'p1',
      deviceName: 'Kes iPhone',
      requesterCommitment: 'requester-commitment',
      requesterPublicKey: null,
      requesterNonce: null,
      createdAt: 1_700_000_000_000,
    };
    const pairingForRequesterFixture = {
      id: 'p1',
      approverPublicKey: 'approver-pubkey',
      envelope: 'v1.dk-1.a.b',
      expiresAt: 1_700_000_600_000,
    };

    it('createPairing POSTs { commitment } to /v1/pairings and returns { id, expiresAt }', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 200, body: pairingCreatedFixture }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      const result = await client.createPairing(wire('requester-commitment'));

      expect(result).toEqual(pairingCreatedFixture);
      expect(calls[0].url).toBe(`${BASE_URL}/v1/pairings`);
      expect(calls[0].init.method).toBe('POST');
      expect(JSON.parse(calls[0].init.body as string)).toEqual({
        commitment: 'requester-commitment',
      });
      const headers = new Headers(calls[0].init.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('createPairing sends no public key, so a commitment is all the server can hold', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 200, body: pairingCreatedFixture }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await client.createPairing(wire('requester-commitment'));

      expect(Object.keys(JSON.parse(calls[0].init.body as string))).toEqual(['commitment']);
    });

    it('listPairings GETs /v1/pairings and unwraps the pairings array', async () => {
      const { fetchFn, calls } = stubFetch([
        { status: 200, body: { pairings: [pendingPairingFixture] } },
      ]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      const pairings = await client.listPairings();

      expect(pairings).toEqual([pendingPairingFixture]);
      expect(calls[0].url).toBe(`${BASE_URL}/v1/pairings`);
      expect(calls[0].init.method).toBe('GET');
    });

    it('getPairing GETs /v1/pairings/:id and returns the parsed body on 200', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 200, body: pairingForRequesterFixture }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      const result = await client.getPairing('p1');

      expect(result).toEqual(pairingForRequesterFixture);
      expect(calls[0].url).toBe(`${BASE_URL}/v1/pairings/p1`);
      expect(calls[0].init.method).toBe('GET');
      const headers = new Headers(calls[0].init.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('getPairing returns null on 404 instead of throwing (expired/denied, a poll state)', async () => {
      const { fetchFn, calls } = stubFetch([problemResponse('pairing_not_found', 404)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      const result = await client.getPairing('gone');

      expect(result).toBeNull();
      expect(calls).toHaveLength(1);
    });

    it('commitPairing POSTs { publicKey } to /v1/pairings/:id/commit and resolves on 204', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 204 }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.commitPairing('p1', wire('approver-pubkey'))).resolves.toBeUndefined();

      expect(calls[0].url).toBe(`${BASE_URL}/v1/pairings/p1/commit`);
      expect(calls[0].init.method).toBe('POST');
      expect(JSON.parse(calls[0].init.body as string)).toEqual({ publicKey: 'approver-pubkey' });
    });

    it('commitPairing rejects with a typed ApiError (code pairing_conflict) on a 409', async () => {
      const { fetchFn, calls } = stubFetch([problemResponse('pairing_conflict', 409)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.commitPairing('p1', wire('approver-pubkey'))).rejects.toMatchObject({
        code: 'pairing_conflict',
        status: 409,
        retryable: false,
      });
      expect(calls).toHaveLength(1);
    });

    it('commitPairing rejects with a typed ApiError on a 404 (pairing gone)', async () => {
      const { fetchFn } = stubFetch([problemResponse('pairing_not_found', 404)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.commitPairing('gone', wire('approver-pubkey'))).rejects.toMatchObject({
        code: 'pairing_not_found',
        status: 404,
        retryable: false,
      });
    });

    it('revealPairing PUTs { publicKey, nonce } to /v1/pairings/:id/reveal and resolves on 204', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 204 }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(
        client.revealPairing('p1', wire('requester-pubkey'), wire('requester-nonce'))
      ).resolves.toBeUndefined();

      expect(calls[0].url).toBe(`${BASE_URL}/v1/pairings/p1/reveal`);
      expect(calls[0].init.method).toBe('PUT');
      expect(JSON.parse(calls[0].init.body as string)).toEqual({
        publicKey: 'requester-pubkey',
        nonce: 'requester-nonce',
      });
      const headers = new Headers(calls[0].init.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('revealPairing rejects with a typed ApiError on a 409 (no commit yet, or already revealed)', async () => {
      const { fetchFn, calls } = stubFetch([problemResponse('pairing_conflict', 409)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.revealPairing('p1', wire('pub'), wire('nonce'))).rejects.toMatchObject({
        code: 'pairing_conflict',
        status: 409,
        retryable: false,
      });
      expect(calls).toHaveLength(1);
    });

    it('putPairingEnvelope PUTs { envelope } to /v1/pairings/:id/envelope and resolves on 204', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 204 }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.putPairingEnvelope('p1', wire('v1.dk-1.a.b'))).resolves.toBeUndefined();

      expect(calls[0].url).toBe(`${BASE_URL}/v1/pairings/p1/envelope`);
      expect(calls[0].init.method).toBe('PUT');
      expect(JSON.parse(calls[0].init.body as string)).toEqual({ envelope: 'v1.dk-1.a.b' });
    });

    it('deletePairing DELETEs /v1/pairings/:id and resolves on 204', async () => {
      const { fetchFn, calls } = stubFetch([{ status: 204 }]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.deletePairing('p1')).resolves.toBeUndefined();

      expect(calls[0].url).toBe(`${BASE_URL}/v1/pairings/p1`);
      expect(calls[0].init.method).toBe('DELETE');
    });

    it('deletePairing resolves on 404 (deny of a vanished row is already done)', async () => {
      const { fetchFn, calls } = stubFetch([problemResponse('pairing_not_found', 404)]);
      const client = new ApiClient({ baseUrl: BASE_URL, getToken: async () => TOKEN, fetchFn });

      await expect(client.deletePairing('gone')).resolves.toBeUndefined();
      expect(calls).toHaveLength(1);
    });
  });
});
