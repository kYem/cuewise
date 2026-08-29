import { vi } from 'vitest';
import type { ResendEmail } from '../../request';

export const testEnv = {
  RESEND_API_KEY: 'test-api-key',
};

export const emptyEnv = {
  RESEND_API_KEY: '',
};

/** What the browser sends when the form posts without its script. */
export function makeNativeFormRequest(fields: Record<string, string>): Request {
  return new Request('https://cuewise.app/api/feedback/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

export function makeRequestFeatureRequest(body: unknown): Request {
  return new Request('https://cuewise.app/api/feedback/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** A fresh Response per call: one shared instance throws "body used already" on the retry path. */
export function stubResendFetch(status: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(() => new Response('{}', { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function stubResendFetchRejection(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The smallest body the handler accepts, so a test can vary one field at a time. */
export const validRequest = {
  area: 'widgets',
  details: 'A master list of tasks I can pull from each day.',
};

interface SentRequest {
  authorization: string;
  idempotencyKey: string;
  email: ResendEmail;
}

/** Whole request, not just the body: a wrong recipient or auth header is otherwise invisible. */
export function sentRequest(fetchMock: ReturnType<typeof vi.fn>, call = 0): SentRequest {
  if (fetchMock.mock.calls.length <= call) {
    throw new Error(`Expected at least ${call + 1} send(s), got ${fetchMock.mock.calls.length}`);
  }
  const [, init] = fetchMock.mock.calls[call];
  return {
    authorization: String(init.headers.Authorization),
    idempotencyKey: String(init.headers['Idempotency-Key']),
    email: JSON.parse(String(init.body)) as ResendEmail,
  };
}

export function sentEmail(fetchMock: ReturnType<typeof vi.fn>, call = 0): ResendEmail {
  return sentRequest(fetchMock, call).email;
}
