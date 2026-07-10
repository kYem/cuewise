import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1SyncStore } from '../d1-store';
import app from '../index';

async function _signedInToken(): Promise<{ token: string; userId: string }> {
  const store = new D1SyncStore(env.DB);
  const userId = await store.findOrCreateUser({ provider: 'google', providerSub: 'mw' });
  const token = await store.createSession(userId, 'test-device');
  return { token, userId };
}

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
});
