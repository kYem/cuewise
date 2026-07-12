import { env } from 'cloudflare:test';
import { errors } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestIdp, type TestIdp } from '../__fixtures__/jwks.fixtures';
import { spyOnLoggerError } from '../__fixtures__/logger.fixtures';
import { base64UrlEncodeString, sha256Base64Url, signState } from '../crypto-utils';
import { createApp } from '../index';

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
  return {
    ...env,
    APPLE_CLIENT_ID: 'apple-client',
    ALLOWED_RETURN_URIS: 'cuewise://auth',
    STATE_SIGNING_KEY: 'apple-test-signing-key',
  };
}

function appWithIdp() {
  return createApp({
    appleVerifier: idp.verifier({ issuer: APPLE_ISS, audience: (e) => e.APPLE_CLIENT_ID }),
  });
}

interface DecodedAppleState {
  returnUri: string;
  codeChallenge: string;
  nonce: string;
}

/** Reads the plaintext payload of a `signState` output; does not verify the signature. */
function decodeState(state: string): DecodedAppleState {
  const body = state.slice(0, state.lastIndexOf('.'));
  return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
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

async function fetchStartState(
  returnUri: string,
  codeChallenge: string = CODE_CHALLENGE
): Promise<string> {
  const res = await getStart(returnUri, codeChallenge);
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

/** Arranges a fresh code via the real start+callback flow; throws on unexpected arrange-time failure. */
async function mintCode(sub: string, codeChallenge?: string): Promise<string> {
  const returnUri = 'cuewise://auth';
  const state = await fetchStartState(returnUri, codeChallenge);
  const idToken = await idp.sign({
    iss: APPLE_ISS,
    aud: 'apple-client',
    sub,
    nonce: decodeState(state).nonce,
  });
  const callbackRes = await postCallback(idToken, state);
  const location = requireHeader(callbackRes, 'Location');
  const code = new URL(location).searchParams.get('code');
  if (code === null) {
    throw new Error('Expected a code query param on the /v1/auth/apple/callback redirect');
  }
  return code;
}

/** Like `mintCode`, but with an email + email_verified claim (Apple sends the latter as a string). */
async function mintCodeWithEmail(
  sub: string,
  email: string,
  emailVerified: boolean | string
): Promise<string> {
  const returnUri = 'cuewise://auth';
  const state = await fetchStartState(returnUri);
  const idToken = await idp.sign({
    iss: APPLE_ISS,
    aud: 'apple-client',
    sub,
    email,
    emailVerified,
    nonce: decodeState(state).nonce,
  });
  const callbackRes = await postCallback(idToken, state);
  const location = requireHeader(callbackRes, 'Location');
  const code = new URL(location).searchParams.get('code');
  if (code === null) {
    throw new Error('Expected a code query param on the /v1/auth/apple/callback redirect');
  }
  return code;
}

describe('POST /v1/auth/apple/callback fails closed on an empty APPLE_CLIENT_ID', () => {
  it('answers 500 rather than accepting a token minted for a different Apple client', async () => {
    // APPLE_CLIENT_ID left at the empty default: an empty audience makes jose skip the aud check
    // (fail-open), so the verifier must reject with 500, not mint a code for another client's token.
    const errorSpy = spyOnLoggerError();
    const misconfiguredEnv = { ...testEnv(), APPLE_CLIENT_ID: '' };
    const app = appWithIdp();
    const returnUri = 'cuewise://auth';

    const startRes = await app.request(
      `/v1/auth/apple/start?${new URLSearchParams({ return_uri: returnUri, code_challenge: CODE_CHALLENGE })}`,
      { method: 'GET' },
      misconfiguredEnv
    );
    const state = new URL(requireHeader(startRes, 'Location')).searchParams.get('state');
    if (state === null) {
      throw new Error('Expected a state query param on the /v1/auth/apple/start redirect');
    }
    const idToken = await idp.sign({
      iss: APPLE_ISS,
      aud: 'some-other-relying-party',
      sub: 'victim-sub',
      nonce: decodeState(state).nonce,
    });

    const res = await app.request(
      '/v1/auth/apple/callback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, state }).toString(),
      },
      misconfiguredEnv
    );

    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(res.headers.get('Location')).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

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
    const nonce = url.searchParams.get('nonce');
    if (nonce === null) {
      throw new Error('Expected a nonce query param on the /v1/auth/apple/start redirect');
    }
    const state = url.searchParams.get('state');
    if (state === null) {
      throw new Error('Expected a state query param on the /v1/auth/apple/start redirect');
    }
    expect(decodeState(state)).toEqual({
      returnUri: 'cuewise://auth',
      codeChallenge: CODE_CHALLENGE,
      nonce,
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
  it('redirects to returnUri with a code param on a successful verification', async () => {
    const returnUri = 'cuewise://auth';
    const state = await fetchStartState(returnUri);
    const idToken = await idp.sign({
      iss: APPLE_ISS,
      aud: 'apple-client',
      sub: 'apple-sub-shape',
      nonce: decodeState(state).nonce,
    });

    const res = await postCallback(idToken, state);

    expect(res.status).toBe(302);
    const location = requireHeader(res, 'Location');
    expect(location.startsWith(`${returnUri}?`)).toBe(true);
    expect(new URL(location).searchParams.get('code')).not.toBeNull();
  });

  it('rejects an ID token whose nonce does not match the state nonce', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: APPLE_ISS,
      aud: 'apple-client',
      sub: 'apple-sub-nonce-mismatch',
      nonce: 'a-different-nonce-entirely',
    });

    const res = await postCallback(idToken, state);
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('rejects an ID token that carries no nonce claim at all', async () => {
    // Distinct from a mismatch: guards the `verified.nonce === undefined` half of the check, so a
    // refactor that made the nonce "optional" (dropping that guard) can't silently pass.
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: APPLE_ISS,
      aud: 'apple-client',
      sub: 'apple-sub-no-nonce',
    });

    const res = await postCallback(idToken, state);
    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
    expect(res.headers.get('Location')).toBeNull();
  });

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

  it('rejects a forged unsigned state even with a genuine id token', async () => {
    // Simulates an attacker who captured a genuine, still-valid id_token and read its
    // plaintext `nonce` claim, then crafted their own state around it — never calling /start.
    const capturedNonce = 'nonce-from-a-captured-id-token';
    const idToken = await idp.sign({
      iss: APPLE_ISS,
      aud: 'apple-client',
      sub: 'apple-sub-attacker-target',
      nonce: capturedNonce,
    });
    const forgedState = base64UrlEncodeString(
      JSON.stringify({
        returnUri: 'cuewise://auth',
        codeChallenge: CODE_CHALLENGE,
        nonce: capturedNonce,
      })
    );

    const res = await postCallback(idToken, forgedState);

    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('rejects a state signed with the wrong key', async () => {
    const nonce = 'nonce-for-wrong-key-test';
    const idToken = await idp.sign({
      iss: APPLE_ISS,
      aud: 'apple-client',
      sub: 'apple-sub-wrong-key',
      nonce,
    });
    const state = await signState(
      { returnUri: 'cuewise://auth', codeChallenge: CODE_CHALLENGE, nonce },
      'a-completely-different-signing-key'
    );

    const res = await postCallback(idToken, state);

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

describe('POST /v1/auth/apple/callback when the HMAC key import fails', () => {
  it('returns 500 internal (not 400) and does not redirect', async () => {
    const signingKey = 'apple-key-import-failure-key';
    const startParams = new URLSearchParams({
      return_uri: 'cuewise://auth',
      code_challenge: CODE_CHALLENGE,
    });
    const startRes = await appWithIdp().request(
      `/v1/auth/apple/start?${startParams.toString()}`,
      { method: 'GET' },
      { ...testEnv(), STATE_SIGNING_KEY: signingKey }
    );
    const startLocation = requireHeader(startRes, 'Location');
    const state = new URL(startLocation).searchParams.get('state');
    if (state === null) {
      throw new Error('Expected a state query param on the /v1/auth/apple/start redirect');
    }

    // Evict the single-slot HMAC key cache with a different key so the callback below is
    // forced through a real (mocked-to-fail) importKey call instead of a cache hit.
    await appWithIdp().request(
      `/v1/auth/apple/start?${startParams.toString()}`,
      { method: 'GET' },
      { ...testEnv(), STATE_SIGNING_KEY: 'apple-key-import-eviction-key' }
    );
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(
      new Error('transient WebCrypto fault')
    );

    const res = await appWithIdp().request(
      '/v1/auth/apple/callback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: 'whatever', state }).toString(),
      },
      { ...testEnv(), STATE_SIGNING_KEY: signingKey }
    );

    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(res.headers.get('Location')).toBeNull();
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

  it('rejects an apple exchange missing codeVerifier, without burning the code', async () => {
    const code = await mintCode('apple-sub-5');

    const res = await exchangeCode(code);
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/codeVerifier')).toBe(true);

    // Proves parseTokenRequest rejected it before consumeAuthCode ran: the code is still live.
    const retryExchange = await exchangeCode(code, CODE_VERIFIER);
    expect(retryExchange.status).toBe(200);
  });

  it('rejects an over-long codeVerifier without burning the code', async () => {
    const code = await mintCode('apple-sub-6');

    const overLong = await exchangeCode(code, 'a'.repeat(129));
    expect(overLong.status).toBe(400);
    const overLongBody = await overLong.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(overLongBody.code).toBe('invalid_request');
    expect(overLongBody.errors.some((e) => e.pointer === '/codeVerifier')).toBe(true);

    // Proves parseTokenRequest rejected it before consumeAuthCode ran: the code is still live.
    const retryExchange = await exchangeCode(code, CODE_VERIFIER);
    expect(retryExchange.status).toBe(200);
  });

  it('rejects an under-length codeVerifier as invalid_request, without burning the code', async () => {
    const code = await mintCode('apple-sub-7');

    const res = await exchangeCode(code, 'a'.repeat(42));

    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/codeVerifier')).toBe(true);

    // Proves parseTokenRequest rejected it before consumeAuthCode ran: the code is still live.
    const retryExchange = await exchangeCode(code, CODE_VERIFIER);
    expect(retryExchange.status).toBe(200);
  });

  it('accepts a codeVerifier at the 128-char RFC 7636 upper bound', async () => {
    const longVerifier = 'a'.repeat(128);
    const longChallenge = await sha256Base64Url(longVerifier);
    const code = await mintCode('apple-sub-8', longChallenge);

    const res = await exchangeCode(code, longVerifier);

    expect(res.status).toBe(200);
  });

  it('rejects a codeVerifier containing a character outside the RFC 7636 unreserved set', async () => {
    const code = await mintCode('apple-sub-9');

    const res = await exchangeCode(code, `${'a'.repeat(42)}!`);
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/codeVerifier')).toBe(true);

    // Proves parseTokenRequest rejected it before consumeAuthCode ran: the code is still live.
    const retryExchange = await exchangeCode(code, CODE_VERIFIER);
    expect(retryExchange.status).toBe(200);
  });

  it('rejects a multi-byte codeVerifier without burning the code', async () => {
    const code = await mintCode('apple-sub-10');

    const res = await exchangeCode(code, `${'a'.repeat(42)}🎉`);
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/codeVerifier')).toBe(true);

    // Proves parseTokenRequest rejected it before consumeAuthCode ran: the code is still live.
    const retryExchange = await exchangeCode(code, CODE_VERIFIER);
    expect(retryExchange.status).toBe(200);
  });
});

describe('POST /v1/auth/token (apple) email verification', () => {
  it('stores the email when email_verified is the string "true"', async () => {
    const code = await mintCodeWithEmail('apple-sub-verified', 'verified@example.com', 'true');

    const res = await exchangeCode(code, CODE_VERIFIER);
    expect(res.status).toBe(200);

    const row = await env.DB.prepare('SELECT email FROM identities WHERE provider_sub = ?')
      .bind('apple-sub-verified')
      .first<{ email: string | null }>();
    if (row === null) {
      throw new Error('expected an identities row for apple-sub-verified');
    }
    expect(row.email).toBe('verified@example.com');
  });

  it('does not store the email when email_verified is the string "false"', async () => {
    const code = await mintCodeWithEmail('apple-sub-unverified', 'unverified@example.com', 'false');

    const res = await exchangeCode(code, CODE_VERIFIER);
    expect(res.status).toBe(200);

    const row = await env.DB.prepare('SELECT email FROM identities WHERE provider_sub = ?')
      .bind('apple-sub-unverified')
      .first<{ email: string | null }>();
    if (row === null) {
      throw new Error('expected an identities row for apple-sub-unverified');
    }
    expect(row.email).toBeNull();
  });
});

describe('apple auth fails closed when STATE_SIGNING_KEY is unset', () => {
  it('returns 500 internal from GET /v1/auth/apple/start', async () => {
    const params = new URLSearchParams({
      return_uri: 'cuewise://auth',
      code_challenge: CODE_CHALLENGE,
    });

    const res = await appWithIdp().request(
      `/v1/auth/apple/start?${params.toString()}`,
      { method: 'GET' },
      { ...testEnv(), STATE_SIGNING_KEY: '' }
    );

    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('returns 500 internal from POST /v1/auth/apple/callback', async () => {
    const res = await appWithIdp().request(
      '/v1/auth/apple/callback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: 'whatever', state: 'whatever' }).toString(),
      },
      { ...testEnv(), STATE_SIGNING_KEY: '' }
    );

    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(res.headers.get('Location')).toBeNull();
  });
});
