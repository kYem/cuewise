import { env } from 'cloudflare:test';
import { errors } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { sha256Base64Url } from '../crypto-utils';
import { createApp } from '../index';
import { createTestIdp, type TestIdp } from './__fixtures__/jwks.fixtures';

const APPLE_ISS = 'https://appleid.apple.com';
// Fixed 43-char base64url verifier; no randomness needed for PKCE binding tests.
const CODE_VERIFIER = 'a'.repeat(43);
const WRONG_CODE_VERIFIER = 'b'.repeat(43);
let idp: TestIdp;
let CODE_CHALLENGE: string;

beforeAll(async () => {
  idp = await createTestIdp();
  CODE_CHALLENGE = await sha256Base64Url(CODE_VERIFIER);
});

function testEnv(): typeof env {
  return { ...env, APPLE_CLIENT_ID: 'apple-client', ALLOWED_RETURN_URIS: 'cuewise://auth' };
}

function appWithIdp() {
  return createApp({
    appleVerifier: idp.verifier({ issuer: APPLE_ISS, audience: (e) => e.APPLE_CLIENT_ID }),
  });
}

function decodeState(state: string): unknown {
  return JSON.parse(atob(state.replace(/-/g, '+').replace(/_/g, '/')));
}

function requireHeader(res: Response, name: string): string {
  const value = res.headers.get(name);
  if (value === null) {
    throw new Error(`Expected a ${name} header on response with status ${res.status}`);
  }
  return value;
}

async function getStart(returnUri: string, codeChallenge: string | null = CODE_CHALLENGE) {
  const params = new URLSearchParams({ return_uri: returnUri });
  if (codeChallenge !== null) {
    params.set('code_challenge', codeChallenge);
  }
  return appWithIdp().request(
    `/v1/auth/apple/start?${params.toString()}`,
    { method: 'GET' },
    testEnv()
  );
}

async function fetchStartState(returnUri: string): Promise<string> {
  const res = await getStart(returnUri);
  const location = requireHeader(res, 'Location');
  const state = new URL(location).searchParams.get('state');
  if (state === null) {
    throw new Error('Expected a state query param on the /v1/auth/apple/start redirect');
  }
  return state;
}

async function postCallback(idToken: string, state: string) {
  return appWithIdp().request(
    '/v1/auth/apple/callback',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, state }).toString(),
    },
    testEnv()
  );
}

async function exchangeCode(code: string, codeVerifier?: string) {
  const body: Record<string, unknown> = { provider: 'apple', credential: code, deviceName: 'Mac' };
  if (codeVerifier !== undefined) {
    body.codeVerifier = codeVerifier;
  }
  return appWithIdp().request(
    '/v1/auth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    testEnv()
  );
}

async function mintCode(sub: string): Promise<string> {
  const returnUri = 'cuewise://auth';
  const state = await fetchStartState(returnUri);
  const idToken = await idp.sign({ iss: APPLE_ISS, aud: 'apple-client', sub });
  const callbackRes = await postCallback(idToken, state);
  expect(callbackRes.status).toBe(302);
  const location = requireHeader(callbackRes, 'Location');
  expect(location.startsWith(`${returnUri}?`)).toBe(true);
  const code = new URL(location).searchParams.get('code');
  if (code === null) {
    throw new Error('Expected a code query param on the /v1/auth/apple/callback redirect');
  }
  return code;
}

describe('GET /v1/auth/apple/start', () => {
  it('redirects to Apple authorize with the expected query params and state', async () => {
    const res = await getStart('cuewise://auth');
    expect(res.status).toBe(302);
    const location = requireHeader(res, 'Location');
    const url = new URL(location);
    expect(url.host).toBe('appleid.apple.com');
    expect(url.searchParams.get('response_type')).toBe('code id_token');
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    expect(url.searchParams.get('client_id')).toBe('apple-client');
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${env.PUBLIC_BASE_URL}/v1/auth/apple/callback`
    );
    expect(url.searchParams.get('scope')).toBe('email');
    const state = url.searchParams.get('state');
    if (state === null) {
      throw new Error('Expected a state query param on the /v1/auth/apple/start redirect');
    }
    expect(decodeState(state)).toEqual({
      returnUri: 'cuewise://auth',
      codeChallenge: CODE_CHALLENGE,
    });
  });

  it('rejects a return_uri that is not allowlisted', async () => {
    const res = await getStart('https://evil.example');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
  });

  it('rejects a return_uri that only shares a prefix with an allowlisted entry', async () => {
    const res = await getStart('cuewise://auth.evil.example');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
  });

  it('rejects a missing code_challenge', async () => {
    const res = await getStart('cuewise://auth', null);
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/code_challenge')).toBe(true);
  });

  it('rejects a code_challenge one character longer than the S256 length', async () => {
    const res = await getStart('cuewise://auth', `${CODE_CHALLENGE}A`);
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/code_challenge')).toBe(true);
  });

  it('reports both return_uri and code_challenge issues when both are bad', async () => {
    const res = await getStart('https://evil.example', 'too-short');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    const pointers = body.errors.map((e) => e.pointer);
    expect(pointers).toContain('/return_uri');
    expect(pointers).toContain('/code_challenge');
  });
});

describe('POST /v1/auth/apple/callback', () => {
  it('mints a one-time code that exchanges for a session token exactly once', async () => {
    const code = await mintCode('apple-sub-1');

    const firstExchange = await exchangeCode(code, CODE_VERIFIER);
    expect(firstExchange.status).toBe(200);
    const tokenBody = await firstExchange.json<{ token: string }>();
    expect(tokenBody.token.length).toBeGreaterThan(20);

    const secondExchange = await exchangeCode(code, CODE_VERIFIER);
    expect(secondExchange.status).toBe(401);
    const secondBody = await secondExchange.json<{ code: string }>();
    expect(secondBody.code).toBe('invalid_token');
  });

  it('rejects a bad-audience ID token without redirecting with a code', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({ iss: APPLE_ISS, aud: 'evil-client', sub: 'apple-sub-2' });

    const res = await postCallback(idToken, state);
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('rejects malformed state without a 500', async () => {
    const idToken = await idp.sign({ iss: APPLE_ISS, aud: 'apple-client', sub: 'apple-sub-3' });

    const res = await postCallback(idToken, '!!!not-base64url!!!');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('returns 500 internal (not invalid_token) when the Apple JWKS fetch times out', async () => {
    const state = await fetchStartState('cuewise://auth');
    const appWithTimeoutVerifier = createApp({
      appleVerifier: async () => {
        throw new errors.JWKSTimeout();
      },
    });

    const res = await appWithTimeoutVerifier.request(
      '/v1/auth/apple/callback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: 'whatever', state }).toString(),
      },
      testEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
  });

  it('returns 500 internal (not invalid_token) when the JWKS endpoint returns a non-200 response', async () => {
    const state = await fetchStartState('cuewise://auth');
    const appWithBadJwksResponse = createApp({
      appleVerifier: async () => {
        throw new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response');
      },
    });

    const res = await appWithBadJwksResponse.request(
      '/v1/auth/apple/callback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: 'whatever', state }).toString(),
      },
      testEnv()
    );
    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
  });

  it('returns 401 invalid_token (not a 500) when no JWKS key matches an unrotated kid', async () => {
    const state = await fetchStartState('cuewise://auth');
    const appWithNoMatchingKey = createApp({
      appleVerifier: async () => {
        throw new errors.JWKSNoMatchingKey();
      },
    });

    const res = await appWithNoMatchingKey.request(
      '/v1/auth/apple/callback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: 'whatever', state }).toString(),
      },
      testEnv()
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });
});

describe('POST /v1/auth/token PKCE binding (apple)', () => {
  it('rejects a wrong codeVerifier and burns the code so a retry also fails', async () => {
    const code = await mintCode('apple-sub-4');

    const wrongExchange = await exchangeCode(code, WRONG_CODE_VERIFIER);
    expect(wrongExchange.status).toBe(401);
    const wrongBody = await wrongExchange.json<{ code: string }>();
    expect(wrongBody.code).toBe('invalid_token');

    const retryExchange = await exchangeCode(code, CODE_VERIFIER);
    expect(retryExchange.status).toBe(401);
    const retryBody = await retryExchange.json<{ code: string }>();
    expect(retryBody.code).toBe('invalid_token');
  });

  it('rejects an apple exchange missing codeVerifier', async () => {
    const code = await mintCode('apple-sub-5');

    const res = await exchangeCode(code);
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/codeVerifier')).toBe(true);
  });
});
