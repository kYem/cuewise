import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleFeatureRequest } from '../request';
import {
  emptyEnv,
  makeRequestFeatureRequest,
  sentEmail,
  stubResendFetch,
  testEnv,
  validRequest,
} from './__fixtures__/request.fixtures';

beforeEach(() => {
  // Default: any unexpected network call will fail the test.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected network call')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleFeatureRequest', () => {
  it('returns 500 when the Resend key is missing', async () => {
    const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), emptyEnv);
    expect(response.status).toBe(500);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await handleFeatureRequest(makeRequestFeatureRequest('not-json'), testEnv);
    expect(response.status).toBe(400);
  });

  it('returns 400 for an unknown area', async () => {
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, area: 'aliens' }),
      testEnv
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 when details are missing, since the request is the details', async () => {
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ area: 'widgets' }),
      testEnv
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for details longer than the cap', async () => {
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, details: 'x'.repeat(2001) }),
      testEnv
    );
    expect(response.status).toBe(400);
  });

  it('reports success without sending when the honeypot is filled, so a bot learns nothing', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, website: 'http://spam.example' }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the request and echoes the area in the subject', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(response.status).toBe(200);
    expect(sentEmail(fetchMock).subject).toContain('widgets');
    expect(sentEmail(fetchMock).text).toContain('A master list of tasks');
  });

  it('carries a reply address through, which is the whole point of asking for one', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'someone@example.com' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('someone@example.com');
  });

  it('drops an unusable reply address rather than rejecting the request behind it', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'not-an-address' }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(sentEmail(fetchMock).text).not.toContain('not-an-address');
  });

  it('records where the request was raised from, so widget asks are separable', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, source: 'widget-picker' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('widget-picker');
  });

  it('returns 502 when Resend rejects the send', async () => {
    stubResendFetch(500);
    const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);
    expect(response.status).toBe(502);
  });
});
