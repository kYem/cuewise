import { vi } from 'vitest';

export const testEnv = {
  RESEND_API_KEY: 'test-api-key',
  RESEND_AUDIENCE_ID: 'test-audience-id',
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
