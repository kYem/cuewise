import { env } from 'cloudflare:test';
import { errors } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { D1SyncStore } from '../d1-store';
import app, { createApp } from '../index';
import { createTestIdp, type TestIdp } from './__fixtures__/jwks.fixtures';

const GOOGLE_ISS = 'https://accounts.google.com';
let idp: TestIdp;

beforeAll(async () => {
  idp = await createTestIdp();
});

function testEnv(): typeof env {
  return { ...env, GOOGLE_CLIENT_IDS: 'test-client, other-client' };
}

function appWithIdp() {
  return createApp({ googleVerifier: idp.verifier({ issuer: GOOGLE_ISS }) });
}

async function postToken(body: unknown) {
  return appWithIdp().request(
    '/v1/auth/token',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    testEnv()
  );
}

describe('POST /v1/auth/token (google)', () => {
  it('exchanges a valid Google ID token for a session token', async () => {
    const idToken = await idp.sign({
      iss: GOOGLE_ISS,
      aud: 'test-client',
      sub: 'g-sub-1',
      email: 'a@b.c',
    });
    const res = await postToken({ provider: 'google', credential: idToken, deviceName: 'Chrome' });
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string }>();
    expect(body.token.length).toBeGreaterThan(20);
  });

  it('rejects a token with a wrong audience as invalid_token', async () => {
    const idToken = await idp.sign({ iss: GOOGLE_ISS, aud: 'evil-client', sub: 'g-sub-1' });
    const res = await postToken({ provider: 'google', credential: idToken, deviceName: 'Chrome' });
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });

  it('returns 500 internal (not invalid_token) when the Google JWKS fetch times out', async () => {
    const appInstance = createApp({
      googleVerifier: async () => {
        throw new errors.JWKSTimeout();
      },
    });
    const res = await appInstance.request(
      '/v1/auth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', credential: 'whatever', deviceName: 'Chrome' }),
      },
      testEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
  });

  it('returns 500 internal (not invalid_token) when the JWKS endpoint returns a non-200 response', async () => {
    const appInstance = createApp({
      googleVerifier: async () => {
        throw new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response');
      },
    });
    const res = await appInstance.request(
      '/v1/auth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', credential: 'whatever', deviceName: 'Chrome' }),
      },
      testEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
  });

  it('returns 401 invalid_token (not a 500) when no JWKS key matches an unrotated kid', async () => {
    const appInstance = createApp({
      googleVerifier: async () => {
        throw new errors.JWKSNoMatchingKey();
      },
    });
    const res = await appInstance.request(
      '/v1/auth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', credential: 'whatever', deviceName: 'Chrome' }),
      },
      testEnv()
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });

  it('rejects a malformed body as invalid_request', async () => {
    const res = await postToken({ provider: 'google' });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
  });

  it('rejects an over-length deviceName as invalid_request', async () => {
    const res = await postToken({
      provider: 'google',
      credential: 'whatever',
      deviceName: 'x'.repeat(101),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/deviceName')).toBe(true);
  });

  it('rejects an over-length credential as invalid_request', async () => {
    const res = await postToken({
      provider: 'google',
      credential: 'x'.repeat(8193),
      deviceName: 'Chrome',
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/credential')).toBe(true);
  });

  it('honors the dev provider only when DEV_FAKE_AUTH=1', async () => {
    const appInstance = appWithIdp();
    const req = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'dev', credential: 'dev-user-1', deviceName: 'e2e' }),
    };
    const off = await appInstance.request('/v1/auth/token', req, testEnv());
    expect(off.status).toBe(400);
    const on = await appInstance.request('/v1/auth/token', req, {
      ...testEnv(),
      DEV_FAKE_AUTH: '1',
    });
    expect(on.status).toBe(200);
  });
});

describe('POST /v1/auth/token (google) email verification', () => {
  it('does not store an email when the token email_verified claim is false', async () => {
    const idToken = await idp.sign({
      iss: GOOGLE_ISS,
      aud: 'test-client',
      sub: 'g-sub-unverified',
      email: 'unverified@example.com',
      emailVerified: false,
    });
    const res = await postToken({ provider: 'google', credential: idToken, deviceName: 'Chrome' });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare('SELECT email FROM identities WHERE provider_sub = ?')
      .bind('g-sub-unverified')
      .first<{ email: string | null }>();
    if (row === null) {
      throw new Error('expected an identities row for g-sub-unverified');
    }
    expect(row.email).toBeNull();
  });
});

describe('POST /v1/auth/logout', () => {
  it('returns 401 unauthorized when no Authorization header is provided', async () => {
    const res = await app.request('/v1/auth/logout', { method: 'POST' }, testEnv());
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });

  it('returns 401 invalid_token when Authorization header contains an invalid token', async () => {
    const res = await app.request(
      '/v1/auth/logout',
      { method: 'POST', headers: { Authorization: 'Bearer garbage' } },
      testEnv()
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });

  it('revokes the session and prevents reuse of the token', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await store.findOrCreateUser({
      provider: 'dev',
      providerSub: 'test-user-logout',
      email: 'logout@test.com',
    });
    const token = await store.createSession(userId, 'test-device');

    const logoutRes = await app.request(
      '/v1/auth/logout',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      testEnv()
    );
    expect(logoutRes.status).toBe(204);

    const changesRes = await app.request(
      '/v1/changes?since=0',
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      testEnv()
    );
    expect(changesRes.status).toBe(401);
    const body = await changesRes.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });
});
