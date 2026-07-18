import { vi } from 'vitest';

export const testEnv = {
  RESEND_API_KEY: 'test-api-key',
};

export const emptyEnv = {
  RESEND_API_KEY: '',
};

export function makeFeedbackRequest(body: unknown): Request {
  return new Request('https://cuewise.app/api/feedback/uninstall', {
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
