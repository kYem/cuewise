import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSubscribe } from '../subscribe';
import { makeSubscribeRequest, stubResendFetch, testEnv } from './__fixtures__/subscribe.fixtures';

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
  });

  it('silently accepts and drops honeypot submissions without calling Resend', async () => {
    const fetchMock = stubResendFetch(201);
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'real@example.com', website: 'spam.com' }),
      testEnv
    );
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('subscribes a valid email via the resend audience api', async () => {
    const fetchMock = stubResendFetch(201);
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'kes@example.com' }),
      testEnv
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/audiences/test-audience-id/contacts',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('treats an already-subscribed contact (409) as success', async () => {
    stubResendFetch(409);
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'kes@example.com' }),
      testEnv
    );
    expect(response.status).toBe(200);
  });

  it('returns 502 when resend fails', async () => {
    stubResendFetch(500);
    const response = await handleSubscribe(
      makeSubscribeRequest({ email: 'kes@example.com' }),
      testEnv
    );
    expect(response.status).toBe(502);
  });
});
