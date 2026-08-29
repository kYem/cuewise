import { vi } from 'vitest';

export const testEnv = {
  RESEND_API_KEY: 'test-api-key',
};

export const emptyEnv = {
  RESEND_API_KEY: '',
};

export function makeRequestFeatureRequest(body: unknown): Request {
  return new Request('https://cuewise.app/api/feedback/request', {
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

/** The smallest body the handler accepts, so a test can vary one field at a time. */
export const validRequest = {
  area: 'widgets',
  details: 'A master list of tasks I can pull from each day.',
};

interface SentEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string[];
}

interface SentRequest {
  authorization: string;
  email: SentEmail;
}

/** Whole request, not just the body: a wrong recipient or auth header is otherwise invisible. */
export function sentRequest(fetchMock: ReturnType<typeof vi.fn>, call = 0): SentRequest {
  const [, init] = fetchMock.mock.calls[call];
  return {
    authorization: String(init.headers.Authorization),
    email: JSON.parse(String(init.body)) as SentEmail,
  };
}

export function sentEmail(fetchMock: ReturnType<typeof vi.fn>, call = 0): SentEmail {
  return sentRequest(fetchMock, call).email;
}
