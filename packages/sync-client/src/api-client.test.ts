import { describe, expect, it, vi } from 'vitest';
import { problemResponse, stubFetch } from './__fixtures__/fetch.fixtures';
import { ApiClient } from './api-client';
import type { PushRecord } from './types';

const BASE_URL = 'https://api.cuewise.app';
const TOKEN = 'session-token-123';

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
});
