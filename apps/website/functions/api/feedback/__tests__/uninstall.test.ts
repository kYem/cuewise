import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleUninstallFeedback } from '../uninstall';
import {
  emptyEnv,
  makeFeedbackRequest,
  stubResendFetch,
  stubResendFetchRejection,
  testEnv,
} from './__fixtures__/uninstall.fixtures';

beforeEach(() => {
  // Default: any unexpected network call will fail the test.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected network call')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleUninstallFeedback', () => {
  it('returns 400 for a malformed JSON body', async () => {
    const response = await handleUninstallFeedback(makeFeedbackRequest('not-json'), testEnv);
    expect(response.status).toBe(400);
  });

  it('returns 400 for an unknown reason', async () => {
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({ reason: 'aliens' }),
      testEnv
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 when reason is missing', async () => {
    const response = await handleUninstallFeedback(makeFeedbackRequest({}), testEnv);
    expect(response.status).toBe(400);
  });

  it('returns 400 when details is not a string', async () => {
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({ reason: 'other', details: 42 }),
      testEnv
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 when details exceeds 2000 characters', async () => {
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({ reason: 'other', details: 'x'.repeat(2001) }),
      testEnv
    );
    expect(response.status).toBe(400);
  });

  it('silently accepts and drops honeypot submissions without calling Resend', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({ reason: 'other', website: 'spam.com' }),
      testEnv
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the feedback email via resend and returns 200', async () => {
    const fetchMock = stubResendFetch(200);
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({
        reason: 'missing-feature',
        details: 'no weekly review',
        version: '1.17.1',
      }),
      testEnv
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    );
    const callInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>).Authorization).toBe('Bearer test-api-key');
    const body = JSON.parse(callInit.body as string);
    expect(body.subject).toBe('Uninstall feedback: missing-feature');
    expect(body.to).toEqual(['support@cuewise.app']);
    expect(body.text).toContain('no weekly review');
    expect(body.text).toContain('1.17.1');
  });

  it('ignores a version that does not look like a version string', async () => {
    stubResendFetch(200);
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({ reason: 'trying', version: '<script>alert(1)</script>' }),
      testEnv
    );
    expect(response.status).toBe(200);
  });

  it('returns 502 when resend responds with a non-ok status', async () => {
    stubResendFetch(500);
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({ reason: 'switched' }),
      testEnv
    );
    expect(response.status).toBe(502);
  });

  it('returns 502 when the fetch call to resend rejects', async () => {
    stubResendFetchRejection();
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({ reason: 'switched' }),
      testEnv
    );
    expect(response.status).toBe(502);
  });

  it('returns 500 when the resend api key is missing', async () => {
    const response = await handleUninstallFeedback(
      makeFeedbackRequest({ reason: 'other' }),
      emptyEnv
    );
    expect(response.status).toBe(500);
  });
});
