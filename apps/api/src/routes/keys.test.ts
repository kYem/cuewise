import { env } from 'cloudflare:test';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { signedInToken } from '../__fixtures__/api-test-helpers.fixtures';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import app from '../index';

type App = Hono<{ Bindings: Env } & AuthVars>;

async function getRecovery(app: App, token: string): Promise<Response> {
  return app.request('/v1/keys/recovery', { headers: { Authorization: `Bearer ${token}` } }, env);
}

async function putRecovery(app: App, token: string, body: unknown): Promise<Response> {
  return app.request(
    '/v1/keys/recovery',
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env
  );
}

describe('/v1/keys/recovery', () => {
  it('rejects unauthenticated GET with 401 problem+json', async () => {
    const res = await app.request('/v1/keys/recovery', {}, env);
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });

  it('rejects unauthenticated PUT with 401 problem+json', async () => {
    const res = await app.request(
      '/v1/keys/recovery',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelope: 'v1.dk-1.aaaa.bbbb' }),
      },
      env
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });

  it('GET before any PUT returns 404 problem+json with type not_found', async () => {
    const { token } = await signedInToken();
    const res = await getRecovery(app, token);
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('not_found');
  });

  it('PUT then GET round-trips the envelope', async () => {
    const { token } = await signedInToken();
    const putRes = await putRecovery(app, token, { envelope: 'v1.dk-1.aaaa.bbbb' });
    expect(putRes.status).toBe(204);

    const getRes = await getRecovery(app, token);
    expect(getRes.status).toBe(200);
    const body = await getRes.json<{ envelope: string; updatedAt: number }>();
    expect(body.envelope).toBe('v1.dk-1.aaaa.bbbb');
    expect(typeof body.updatedAt).toBe('number');
    expect(body.updatedAt).toBeGreaterThan(0);
  });

  it('PUT overwrites the previous envelope (regeneration)', async () => {
    const { token } = await signedInToken();
    await putRecovery(app, token, { envelope: 'v1.dk-1.aaaa.bbbb' });
    const secondPut = await putRecovery(app, token, { envelope: 'v1.dk-2.cccc.dddd' });
    expect(secondPut.status).toBe(204);

    const getRes = await getRecovery(app, token);
    const body = await getRes.json<{ envelope: string }>();
    expect(body.envelope).toBe('v1.dk-2.cccc.dddd');
  });

  it('PUT rejects an empty-string envelope with 400 invalid_key_envelope', async () => {
    const { token } = await signedInToken();
    const res = await putRecovery(app, token, { envelope: '' });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_key_envelope');
  });

  it('PUT rejects a non-string envelope with 400 invalid_key_envelope', async () => {
    const { token } = await signedInToken();
    const res = await putRecovery(app, token, { envelope: 123 });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_key_envelope');
  });

  it('PUT rejects an envelope over 1024 bytes with 400 invalid_key_envelope', async () => {
    const { token } = await signedInToken();
    const res = await putRecovery(app, token, { envelope: 'x'.repeat(1025) });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_key_envelope');
  });

  it('PUT accepts an envelope of exactly 1024 bytes', async () => {
    const { token } = await signedInToken();
    const res = await putRecovery(app, token, { envelope: 'x'.repeat(1024) });
    expect(res.status).toBe(204);
  });

  it('PUT rejects a multi-byte envelope over 1024 UTF-8 bytes despite fewer UTF-16 units', async () => {
    const { token } = await signedInToken();
    // '€' is 1 UTF-16 unit but 3 UTF-8 bytes: 400 units, 1200 bytes.
    const res = await putRecovery(app, token, { envelope: '€'.repeat(400) });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_key_envelope');
  });

  it('PUT rejects a literal null JSON body with 400 invalid_key_envelope', async () => {
    const { token } = await signedInToken();
    const res = await putRecovery(app, token, null);
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_key_envelope');
  });

  it('PUT rejects a missing body with 400', async () => {
    const { token } = await signedInToken();
    const res = await app.request(
      '/v1/keys/recovery',
      { method: 'PUT', headers: { Authorization: `Bearer ${token}` } },
      env
    );
    expect(res.status).toBe(400);
  });

  it('two users see only their own envelopes', async () => {
    const a = await signedInToken();
    const b = await signedInToken();
    await putRecovery(app, a.token, { envelope: 'v1.dk-1.a-only' });
    await putRecovery(app, b.token, { envelope: 'v1.dk-1.b-only' });

    const aRes = await getRecovery(app, a.token);
    const aBody = await aRes.json<{ envelope: string }>();
    expect(aBody.envelope).toBe('v1.dk-1.a-only');

    const bRes = await getRecovery(app, b.token);
    const bBody = await bRes.json<{ envelope: string }>();
    expect(bBody.envelope).toBe('v1.dk-1.b-only');
  });
});
