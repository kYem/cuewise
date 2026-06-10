import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSubscribe } from '../subscribe';
import {
  emptyEnv,
  makeOverlongEmail,
  makeSubscribeRequest,
  stubResendFetch,
  stubResendFetchRejection,
  testEnv,
} from './__fixtures__/subscribe.fixtures';

beforeEach(() => {
  // Default: any unexpected network call will fail the test.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected network call')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleSubscribe', () => {
  it('returns 400 for a malformed JSON body', async () => {
    const response = await handleSubscribe(makeSubscribeRequest('not-json'), testEnv);
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid email', async () => {
    const response = await handleSubscribe(makeSubscribeRequest({ email: 'nope' }), testEnv);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Please enter a valid email address' });
  });

  it('returns 400 when body has no email field', async () => {
    const response = await handleSubscribe(makeSubscribeRequest({}), testEnv);
    expect(response.status).toBe(400);
  });

  it('returns 400 when email is a number', async () => {
    const response = await handleSubscribe(makeSubscribeRequest({ email: 123 }), testEnv);
    expect(response.status).toBe(400);
  });

  it('returns 400 when email exceeds 254 characters', async () => {
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: makeOverlongEmail() }),
      testEnv
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Please enter a valid email address' });
  });

  it('silently accepts and drops honeypot submissions without calling Resend', async () => {
    const fetchMock = stubResendFetch(201);
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'real@example.com', website: 'spam.com' }),
      testEnv
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('subscribes a valid email via the resend audience api', async () => {
    const fetchMock = stubResendFetch(201);
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'kes@example.com' }),
      testEnv
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/audiences/test-audience-id/contacts',
      expect.objectContaining({ method: 'POST' })
    );
    const callInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>).Authorization).toBe('Bearer test-api-key');
    expect(JSON.parse(callInit.body as string)).toEqual({
      email: 'kes@example.com',
      unsubscribed: false,
    });
  });

  it('treats an already-subscribed contact (409) as success', async () => {
    stubResendFetch(409);
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'kes@example.com' }),
      testEnv
    );
    expect(response.status).toBe(200);
  });

  it('returns 502 when resend responds with a non-ok status', async () => {
    stubResendFetch(500);
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'kes@example.com' }),
      testEnv
    );
    expect(response.status).toBe(502);
  });

  it('returns 502 when the fetch call to resend rejects', async () => {
    stubResendFetchRejection();
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'kes@example.com' }),
      testEnv
    );
    expect(response.status).toBe(502);
  });

  it('returns 500 when resend env vars are missing', async () => {
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'kes@example.com' }),
      emptyEnv
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Newsletter is temporarily unavailable' });
  });
});
