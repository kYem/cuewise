import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import app from './index';
import { problem } from './problem-details';

describe('problem()', () => {
  it('builds an RFC 9457 body with extensions and Retry-After header', async () => {
    const res = problem('rate_limited', { detail: 'Slow down.', retryAfter: 30 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.json()).toEqual({
      type: 'https://cuewise.app/problems/rate-limited',
      title: 'Too many requests',
      status: 429,
      code: 'rate_limited',
      detail: 'Slow down.',
      retryAfter: 30,
    });
  });
});

describe('app-wide error shape', () => {
  it('unknown routes return a not_found problem', async () => {
    const res = await app.request('/v1/nope', {}, env);
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('not_found');
  });
});
