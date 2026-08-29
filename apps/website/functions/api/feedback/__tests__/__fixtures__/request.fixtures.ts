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

/** The smallest body the handler accepts, so a test can vary one field at a time. */
export const validRequest = {
  area: 'widgets',
  details: 'A master list of tasks I can pull from each day.',
};

export function sentEmail(fetchMock: ReturnType<typeof vi.fn>): { subject: string; text: string } {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse(String(init.body));
}
