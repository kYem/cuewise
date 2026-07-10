import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../index';
import { createTestIdp, type TestIdp } from './__fixtures__/jwks.fixtures';

const APPLE_ISS = 'https://appleid.apple.com';
let idp: TestIdp;

beforeAll(async () => {
  idp = await createTestIdp();
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

async function getStart(returnUri: string) {
  return appWithIdp().request(
    `/v1/auth/apple/start?return_uri=${encodeURIComponent(returnUri)}`,
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

async function exchangeCode(code: string) {
  return appWithIdp().request(
    '/v1/auth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'apple', credential: code, deviceName: 'Mac' }),
    },
    testEnv()
  );
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
    expect(url.searchParams.get('scope')).toBe('name email');
    const state = url.searchParams.get('state');
    if (state === null) {
      throw new Error('Expected a state query param on the /v1/auth/apple/start redirect');
    }
    expect(decodeState(state)).toEqual({ returnUri: 'cuewise://auth' });
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
});

describe('POST /v1/auth/apple/callback', () => {
  it('mints a one-time code that exchanges for a session token exactly once', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: APPLE_ISS,
      aud: 'apple-client',
      sub: 'apple-sub-1',
      email: 'a@b.c',
    });

    const callbackRes = await postCallback(idToken, state);
    expect(callbackRes.status).toBe(302);
    const location = requireHeader(callbackRes, 'Location');
    expect(location.startsWith('cuewise://auth?')).toBe(true);
    const code = new URL(location).searchParams.get('code');
    if (code === null) {
      throw new Error('Expected a code query param on the /v1/auth/apple/callback redirect');
    }

    const firstExchange = await exchangeCode(code);
    expect(firstExchange.status).toBe(200);
    const tokenBody = await firstExchange.json<{ token: string }>();
    expect(tokenBody.token.length).toBeGreaterThan(20);

    const secondExchange = await exchangeCode(code);
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
});
