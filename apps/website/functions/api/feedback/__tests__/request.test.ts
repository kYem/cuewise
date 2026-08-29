import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEEDBACK_AREAS } from '../../../../src/lib/feedback-areas';
import { handleFeatureRequest } from '../request';
import {
  emptyEnv,
  makeNativeFormRequest,
  makeRequestFeatureRequest,
  sentEmail,
  sentRequest,
  stubResendFetch,
  stubResendFetchRejection,
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
      makeRequestFeatureRequest({ ...validRequest, trap: 'http://spam.example' }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends when the honeypot is present but empty, which is every real submission', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, trap: '' }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores the old honeypot name, which is what password managers autofill', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, website: 'https://autofilled.example' }),
      testEnv
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the request and echoes the area in the subject', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(response.status).toBe(200);
    expect(sentEmail(fetchMock).subject).toContain('widgets');
    expect(sentEmail(fetchMock).text).toContain('A master list of tasks');
  });

  it('sets reply_to, so hitting reply reaches the person and not our own inbox', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'someone@example.com' }),
      testEnv
    );

    expect(sentEmail(fetchMock).reply_to).toEqual(['someone@example.com']);
  });

  it('keeps reply_to off entirely when no address was given', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(sentEmail(fetchMock).reply_to).toBeUndefined();
  });

  it('never puts an unusable address in reply_to, which would fail the whole send', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'not-an-address' }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(sentEmail(fetchMock).reply_to).toBeUndefined();
  });

  it('still records an unusable address, which is answerable by hand', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'kes@gmail' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('kes@gmail');
    expect(sentEmail(fetchMock).reply_to).toBeUndefined();
  });

  it('reuses one idempotency key across the retry, so a lost response cannot deliver twice', async () => {
    const fetchMock = stubResendFetch(422);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'someone@example.com' }),
      testEnv
    );

    expect(sentRequest(fetchMock, 0).idempotencyKey).toBe(sentRequest(fetchMock, 1).idempotencyKey);
  });

  it('addresses the support inbox with the configured key', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(sentRequest(fetchMock).email.to).toEqual(['support@cuewise.app']);
    expect(sentRequest(fetchMock).authorization).toBe('Bearer test-api-key');
  });

  it('records where the request was raised from, so widget asks are separable', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, source: 'widget-picker' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('widget-picker');
  });

  it('does not claim a source it was never given, which would poison the split', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(sentEmail(fetchMock).text).toContain('Source: unknown');
  });

  it('drops a source that could never be one of ours', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, source: '../../etc/passwd' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('Source: unknown');
  });

  it('never echoes an attacker-supplied version, which arrives straight off the query string', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, version: '<script>alert(1)</script>' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('Version: unknown');
    expect(sentEmail(fetchMock).text).not.toContain('<script>');
  });

  it('rejects details that are only whitespace, which the browser lets through', async () => {
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, details: '   \n  ' }),
      testEnv
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 for a JSON body that is not an object', async () => {
    const response = await handleFeatureRequest(makeRequestFeatureRequest('null'), testEnv);
    expect(response.status).toBe(400);
  });

  it.each(
    FEEDBACK_AREAS.map((a) => a.value)
  )('accepts %s, so no radio on the form can 400 a typed-out request', async (area) => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, area }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(sentEmail(fetchMock).subject).toContain(area);
  });

  it('echoes a valid version, so a request can be read against what they saw', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, version: '1.25.0' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('Version: 1.25.0');
  });

  it('accepts details at exactly the cap, which is what the textarea allows', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, details: 'x'.repeat(2000) }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never lets an oversized address reach reply_to', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: `${'x'.repeat(250)}@example.com` }),
      testEnv
    );

    expect(sentEmail(fetchMock).reply_to).toBeUndefined();
  });

  it('sends from the verified domain, which Resend also rejects on', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(sentEmail(fetchMock).from).toContain('feedback@cuewise.app');
  });

  it('returns 502 when Resend rejects the send', async () => {
    const fetchMock = stubResendFetch(500);
    const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failure that is not about the address, which would burn rate budget', async () => {
    const fetchMock = stubResendFetch(429);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'someone@example.com' }),
      testEnv
    );

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries at most once when the second attempt also fails', async () => {
    const fetchMock = stubResendFetch(422);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'someone@example.com' }),
      testEnv
    );

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries without reply_to when Resend refuses the address, rather than losing the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"name":"validation_error"}', { status: 422 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, email: 'someone@example.com' }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentEmail(fetchMock, 1).reply_to).toBeUndefined();
    expect(sentEmail(fetchMock, 1).text).toContain('someone@example.com');
  });

  it('returns 502 when the request to Resend throws', async () => {
    stubResendFetchRejection();
    const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);
    expect(response.status).toBe(502);
  });

  describe('native form post, for a submit that beat the script', () => {
    it('accepts a form-encoded body and sends it', async () => {
      const fetchMock = stubResendFetch(200);
      const response = await handleFeatureRequest(makeNativeFormRequest(validRequest), testEnv);

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/feedback/?sent=1');
      expect(sentEmail(fetchMock).text).toContain('A master list of tasks');
    });

    it('redirects rather than answering a navigation with raw JSON', async () => {
      const response = await handleFeatureRequest(
        makeNativeFormRequest({ ...validRequest, area: 'aliens' }),
        testEnv
      );

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/feedback/?failed=1');
    });

    it('keeps answering fetch submissions with JSON', async () => {
      stubResendFetch(200);
      const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });
  });
});
