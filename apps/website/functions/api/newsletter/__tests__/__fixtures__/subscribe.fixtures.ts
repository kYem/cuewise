import { vi } from 'vitest';

export const testEnv = {
  RESEND_API_KEY: 'test-api-key',
  RESEND_AUDIENCE_ID: 'test-audience-id',
};

export const emptyEnv = {
  RESEND_API_KEY: '',
  RESEND_AUDIENCE_ID: '',
};

export function makeSubscribeRequest(body: unknown): Request {
  return new Request('https://cuewise.app/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function stubResendFetch(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function stubResendFetchRejection(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Email of exactly 255 chars (one over the 254-char RFC limit). */
export function makeOverlongEmail(): string {
  // local part fills up to make total 255: "a...a@b.com" where local = 255 - 6 = 249 chars
  const local = 'a'.repeat(249);
  return `${local}@b.com`;
}
