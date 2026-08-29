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

  it('records a version it had to reject, so a whole channel cannot read as never-wired', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, version: '1.26.0-beta.1' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('1.26.0-beta.1');
    expect(sentEmail(fetchMock).text).toContain('Version: unknown (rejected:');
  });

  it('records a source it had to reject', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, source: 'widgetPicker' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('Source: unknown (rejected: widgetPicker)');
  });

  it('addresses the support inbox with the configured key', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(sentRequest(fetchMock).email.to).toEqual(['support@cuewise.app']);
    expect(sentRequest(fetchMock).authorization).toBe('Bearer test-api-key');
    expect(sentRequest(fetchMock).url).toBe('https://api.resend.com/emails');
    expect(sentRequest(fetchMock).method).toBe('POST');
    expect(sentRequest(fetchMock).contentType).toBe('application/json');
  });

  it('names the empty description, rather than telling them the site is broken', async () => {
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, details: '   ' }),
      testEnv
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain('came through empty');
  });

  it('answers a failed send with the message the form shows', async () => {
    stubResendFetch(500);
    const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);
    const body = (await response.json()) as { error?: string };

    expect(body.error).toContain('email us instead');
  });

  it('sends when the honeypot holds only whitespace, which autofill can leave behind', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, trap: '   ' }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('names the type of a non-string it rejected, rather than throwing on it', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, version: 3, source: ['a'] }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(sentEmail(fetchMock).text).toContain('Version: unknown (rejected: number)');
    expect(sentEmail(fetchMock).text).toContain('Source: unknown (rejected: object)');
  });

  it('counts a value that survives no scrubbing, so it cannot read as nothing sent', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, version: '日本語です' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('Version: unknown (rejected: 5 non-ascii chars)');
  });

  it('says the description was too long, rather than calling it empty', async () => {
    const response = await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, details: 'x'.repeat(2001) }),
      testEnv
    );
    const body = (await response.json()) as { error?: string };

    expect(body.error).toContain('longer than 2000');
  });

  it('does not retry a 422 when there was no address to blame', async () => {
    const fetchMock = stubResendFetch(422);
    const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps an unusable address on one bounded line, so it cannot forge another', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({
        ...validRequest,
        email: `x\nReply to: attacker@example.com\n${'y'.repeat(400)}`,
      }),
      testEnv
    );

    const replyLines = sentEmail(fetchMock)
      .text.split('\n')
      .filter((line) => line.startsWith('Reply to:'));
    expect(replyLines).toHaveLength(1);
    expect(replyLines[0].length).toBeLessThan(300);
  });

  it('caps how much of a rejected value a stranger can write into the inbox', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, version: '9'.repeat(300) }),
      testEnv
    );

    const versionLine = sentEmail(fetchMock)
      .text.split('\n')
      .find((line) => line.startsWith('Version:'));
    expect(versionLine?.length).toBeLessThan(80);
  });

  it('records where the request was raised from, so widget asks are separable', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, source: 'widget-picker' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('Source: widget-picker');
  });

  it('does not claim a source it was never given, which would poison the split', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

    expect(sentEmail(fetchMock).text).toContain('Source: unknown');
  });

  it('echoes a rejected source scrubbed to a slug charset', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, source: '../../etc/passwd' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('Source: unknown');
  });

  it('strips markup from a rejected version before echoing it', async () => {
    const fetchMock = stubResendFetch(200);
    await handleFeatureRequest(
      makeRequestFeatureRequest({ ...validRequest, version: '<script>alert(1)</script>' }),
      testEnv
    );

    expect(sentEmail(fetchMock).text).toContain('Version: unknown');
    expect(sentEmail(fetchMock).text).not.toContain('<script>');
    expect(sentEmail(fetchMock).text).not.toContain('(1)');
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
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    // Same string as the non-ok path: the client renders it verbatim, so they must not drift.
    expect(body.error).toContain('email us instead');
  });

  describe('native form post, for a submit that beat the script', () => {
    it('accepts a form-encoded body and sends it', async () => {
      const fetchMock = stubResendFetch(200);
      const response = await handleFeatureRequest(makeNativeFormRequest(validRequest), testEnv);

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/feedback/sent/');
      expect(sentEmail(fetchMock).text).toContain('A master list of tasks');
    });

    it('redirects rather than answering a navigation with raw JSON', async () => {
      const response = await handleFeatureRequest(
        makeNativeFormRequest({ ...validRequest, area: 'aliens' }),
        testEnv
      );

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/feedback/failed/');
    });

    it('answers a honeypot hit the same way it answers a success', async () => {
      const fetchMock = stubResendFetch(200);
      const response = await handleFeatureRequest(
        makeNativeFormRequest({ ...validRequest, trap: 'http://spam.example' }),
        testEnv
      );

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/feedback/sent/');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps answering fetch submissions with JSON', async () => {
      stubResendFetch(200);
      const response = await handleFeatureRequest(makeRequestFeatureRequest(validRequest), testEnv);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });
  });
});
