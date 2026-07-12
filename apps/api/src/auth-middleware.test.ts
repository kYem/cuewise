import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import app from './index';

describe('requireSession', () => {
  it('rejects a missing Authorization header with an unauthorized problem', async () => {
    const res = await app.request('/v1/changes?since=0', {}, env);
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });

  it('rejects an unknown bearer token with invalid_token', async () => {
    const res = await app.request(
      '/v1/changes?since=0',
      { headers: { Authorization: 'Bearer nope' } },
      env
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });

  it('treats an empty bearer token ("Bearer ") as missing, not as a token to look up', async () => {
    const res = await app.request(
      '/v1/changes?since=0',
      { headers: { Authorization: 'Bearer ' } },
      env
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });
});
