import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  TEST_CODE_VERIFIER as CODE_VERIFIER,
  decodeState,
  requireHeader,
} from '../__fixtures__/bounce.fixtures';
import { createTestIdp, type TestIdp } from '../__fixtures__/jwks.fixtures';
import { spyOnLoggerError } from '../__fixtures__/logger.fixtures';
import { base64UrlEncodeString, sha256Base64Url, signState } from '../crypto-utils';
import { createApp } from '../index';
import type { SyncStore } from '../store';
import { exchangeGoogleCode, type GoogleCodeExchanger } from './google';

const GOOGLE_ISS = 'https://accounts.google.com';
const GOOGLE_CLIENT = 'google-client';
let idp: TestIdp;
let CODE_CHALLENGE: string;

beforeAll(async () => {
  idp = await createTestIdp();
  CODE_CHALLENGE = await sha256Base64Url(CODE_VERIFIER);
});

function testEnv(): typeof env {
  return {
    ...env,
    GOOGLE_CLIENT_IDS: GOOGLE_CLIENT,
    GOOGLE_OAUTH_CLIENT_ID: GOOGLE_CLIENT,
    GOOGLE_CLIENT_SECRET: 'google-test-client-secret',
    ALLOWED_RETURN_URIS: 'cuewise://auth',
    STATE_SIGNING_KEY: 'google-test-signing-key',
  };
}

/** An exchanger that always trades the code for the given id_token. */
function exchangerReturning(idToken: string): GoogleCodeExchanger {
  return async () => ({ ok: true, idToken });
}

function appWith(exchanger: GoogleCodeExchanger) {
  return createApp({
    googleVerifier: idp.verifier({ issuer: GOOGLE_ISS }),
    googleCodeExchanger: exchanger,
  });
}

/**
 * Extracts the deep-link target from an interstitial page (ENG-66: a 200 HTML page fires the
 * cuewise:// link instead of a bare 302, so the tab isn't left "stuck on Google").
 */
async function deepLinkTarget(res: Response): Promise<URL> {
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('text/html');
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  const html = await res.text();
  const match = html.match(/location\.replace\((".*?")\);/);
  if (match === null) {
    throw new Error('expected a location.replace deep link in the interstitial page');
  }
  return new URL(JSON.parse(match[1]));
}

/** Asserts a sanitized error relay: an interstitial to the cuewise://auth URI, never a code. */
async function expectErrorRelay(res: Response, error: string): Promise<void> {
  const url = await deepLinkTarget(res);
  expect(url.toString().startsWith('cuewise://auth?')).toBe(true);
  expect(url.searchParams.get('error')).toBe(error);
  expect(url.searchParams.get('code')).toBeNull();
}

async function getStart(
  returnUri: string,
  codeChallenge: string | null = CODE_CHALLENGE,
  overrides: Partial<ReturnType<typeof testEnv>> = {}
) {
  const params = new URLSearchParams({ return_uri: returnUri });
  if (codeChallenge !== null) {
    params.set('code_challenge', codeChallenge);
  }
  return appWith(exchangerReturning('unused')).request(
    `/v1/auth/google/start?${params.toString()}`,
    { method: 'GET' },
    { ...testEnv(), ...overrides }
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
    throw new Error('Expected a state query param on the /v1/auth/google/start redirect');
  }
  return state;
}

async function getCallback(
  exchanger: GoogleCodeExchanger,
  params: Record<string, string>,
  overrides: Partial<ReturnType<typeof testEnv>> = {}
) {
  return appWith(exchanger).request(
    `/v1/auth/google/callback?${new URLSearchParams(params).toString()}`,
    { method: 'GET' },
    { ...testEnv(), ...overrides }
  );
}

/** Arranges a signed state + a matching id_token, the two halves every callback test needs. */
async function arrangeCallback(sub: string): Promise<{ state: string; idToken: string }> {
  const state = await fetchStartState('cuewise://auth');
  const idToken = await idp.sign({
    iss: GOOGLE_ISS,
    aud: GOOGLE_CLIENT,
    sub,
    nonce: decodeState(state).nonce,
  });
  return { state, idToken };
}

describe('GET /v1/auth/google/start', () => {
  it('redirects to Google authorize with the expected query params and state', async () => {
    const res = await getStart('cuewise://auth');
    expect(res.status).toBe(302);
    const url = new URL(requireHeader(res, 'Location'));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(GOOGLE_CLIENT);
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${env.PUBLIC_BASE_URL}/v1/auth/google/callback`
    );
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('prompt')).toBe('select_account');
    const nonce = url.searchParams.get('nonce');
    if (nonce === null) {
      throw new Error('Expected a nonce query param on the /v1/auth/google/start redirect');
    }
    const state = url.searchParams.get('state');
    if (state === null) {
      throw new Error('Expected a state query param on the /v1/auth/google/start redirect');
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

  it('rejects a missing code_challenge', async () => {
    const res = await getStart('cuewise://auth', null);
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/code_challenge')).toBe(true);
  });

  // Config faults after input validation redirect the (allowlisted) return_uri with
  // error=server_error, so the app's pending flow settles instead of waiting out its timeout.
  it('relays server_error to the return_uri when STATE_SIGNING_KEY is unset', async () => {
    const errorSpy = spyOnLoggerError();
    const res = await getStart('cuewise://auth', CODE_CHALLENGE, { STATE_SIGNING_KEY: '' });
    await expectErrorRelay(res, 'server_error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('relays server_error when GOOGLE_OAUTH_CLIENT_ID is unset (fails closed, loudly)', async () => {
    const errorSpy = spyOnLoggerError();
    const res = await getStart('cuewise://auth', CODE_CHALLENGE, { GOOGLE_OAUTH_CLIENT_ID: '' });
    await expectErrorRelay(res, 'server_error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('relays server_error when GOOGLE_CLIENT_SECRET is unset — before any consent dance', async () => {
    const errorSpy = spyOnLoggerError();
    const res = await getStart('cuewise://auth', CODE_CHALLENGE, { GOOGLE_CLIENT_SECRET: '' });
    await expectErrorRelay(res, 'server_error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps problem+json for an unallowlisted return_uri even when config is also broken', async () => {
    // An unvalidated return_uri must never receive a redirect, no matter what else is wrong.
    const res = await getStart('https://evil.example', CODE_CHALLENGE, { STATE_SIGNING_KEY: '' });
    expect(res.status).toBe(400);
    expect(res.headers.get('Location')).toBeNull();
  });
});

describe('GET /v1/auth/google/callback', () => {
  it('serves a signed-in interstitial carrying the code on a successful exchange + verification', async () => {
    const { state, idToken } = await arrangeCallback('google-sub-happy');
    const exchanger = vi.fn(exchangerReturning(idToken));

    const res = await getCallback(exchanger, { code: 'google-auth-code', state });

    const url = await deepLinkTarget(res);
    expect(url.toString().startsWith('cuewise://auth?')).toBe(true);
    expect(url.searchParams.get('code')).not.toBeNull();
    expect(exchanger).toHaveBeenCalledWith('google-auth-code', expect.anything());
  });

  it('relays a user cancel as error=access_denied without exchanging, even when a code rides along', async () => {
    const state = await fetchStartState('cuewise://auth');
    const exchanger = vi.fn(exchangerReturning('unused'));

    // code + error together: the error must win — an errored flow never reaches Google's
    // token endpoint with our client secret.
    const res = await getCallback(exchanger, { error: 'access_denied', code: 'x', state });

    await expectErrorRelay(res, 'access_denied');
    expect(exchanger).not.toHaveBeenCalled();
  });

  it('collapses an unknown OAuth error value to auth_failed', async () => {
    const state = await fetchStartState('cuewise://auth');

    const res = await getCallback(exchangerReturning('unused'), {
      error: 'admin_policy_enforced"><script>alert(1)</script>',
      state,
    });

    await expectErrorRelay(res, 'auth_failed');
  });

  it('relays an authorize-endpoint transient fault as server_error, loudly', async () => {
    // Google's own authorize endpoint faulting is a retryable server incident (RFC 6749
    // §4.1.2.1), not a sign-in failure — a mis-map would tell the user their auth failed.
    const errorSpy = spyOnLoggerError();
    const state = await fetchStartState('cuewise://auth');

    const res = await getCallback(exchangerReturning('unused'), {
      error: 'temporarily_unavailable',
      state,
    });

    await expectErrorRelay(res, 'server_error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('relays server_error when minting the one-time code throws (D1 fault at the last step)', async () => {
    const errorSpy = spyOnLoggerError();
    const { state, idToken } = await arrangeCallback('google-sub-mint-fault');
    const app = createApp({
      googleVerifier: idp.verifier({ issuer: GOOGLE_ISS }),
      googleCodeExchanger: exchangerReturning(idToken),
      storeFactory: () =>
        ({
          mintAuthCode: async () => {
            throw new Error('D1 write failed');
          },
        }) as unknown as SyncStore,
    });

    const res = await app.request(
      `/v1/auth/google/callback?${new URLSearchParams({ code: 'x', state }).toString()}`,
      { method: 'GET' },
      testEnv()
    );

    await expectErrorRelay(res, 'server_error');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects an error leg whose state is forged — no redirect for an unproven flow', async () => {
    const forgedState = base64UrlEncodeString(
      JSON.stringify({ returnUri: 'cuewise://auth', codeChallenge: CODE_CHALLENGE, nonce: 'n' })
    );

    const res = await getCallback(exchangerReturning('unused'), {
      error: 'access_denied',
      state: forgedState,
    });

    expect(res.status).toBe(400);
    expect(res.headers.get('Location')).toBeNull();
  });

  it('rejects a missing state', async () => {
    const res = await getCallback(exchangerReturning('unused'), { code: 'whatever' });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
  });

  it('relays auth_failed when neither code nor error arrives with a valid state', async () => {
    const state = await fetchStartState('cuewise://auth');
    const res = await getCallback(exchangerReturning('unused'), { state });
    await expectErrorRelay(res, 'auth_failed');
  });

  it('rejects a state signed with the wrong key', async () => {
    const state = await signState(
      { returnUri: 'cuewise://auth', codeChallenge: CODE_CHALLENGE, nonce: 'n' },
      'a-completely-different-signing-key'
    );

    const res = await getCallback(exchangerReturning('unused'), { code: 'whatever', state });

    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('relays server_error without exchanging when GOOGLE_CLIENT_SECRET is unset', async () => {
    const errorSpy = spyOnLoggerError();
    const state = await fetchStartState('cuewise://auth');
    const exchanger = vi.fn(exchangerReturning('unused'));

    const res = await getCallback(
      exchanger,
      { code: 'whatever', state },
      { GOOGLE_CLIENT_SECRET: '' }
    );

    await expectErrorRelay(res, 'server_error');
    expect(exchanger).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('relays auth_failed when the code exchange reports a token fault', async () => {
    const state = await fetchStartState('cuewise://auth');
    const exchanger: GoogleCodeExchanger = async () => ({ ok: false, kind: 'token_fault' });

    const res = await getCallback(exchanger, { code: 'bad-code', state });

    await expectErrorRelay(res, 'auth_failed');
  });

  it('relays server_error when the code exchange reports a transient fault', async () => {
    const state = await fetchStartState('cuewise://auth');
    const exchanger: GoogleCodeExchanger = async () => ({ ok: false, kind: 'transient' });

    const res = await getCallback(exchanger, { code: 'whatever', state });

    await expectErrorRelay(res, 'server_error');
  });

  it('relays auth_failed for an ID token whose nonce does not match the state nonce', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: GOOGLE_ISS,
      aud: GOOGLE_CLIENT,
      sub: 'google-sub-nonce-mismatch',
      nonce: 'a-different-nonce-entirely',
    });

    const res = await getCallback(exchangerReturning(idToken), { code: 'whatever', state });

    await expectErrorRelay(res, 'auth_failed');
  });

  it('relays auth_failed for an ID token that carries no nonce claim at all', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: GOOGLE_ISS,
      aud: GOOGLE_CLIENT,
      sub: 'google-sub-no-nonce',
    });

    const res = await getCallback(exchangerReturning(idToken), { code: 'whatever', state });

    await expectErrorRelay(res, 'auth_failed');
  });

  it('relays auth_failed for a bad-audience ID token, never a code', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: GOOGLE_ISS,
      aud: 'evil-client',
      sub: 'google-sub-bad-aud',
      nonce: decodeState(state).nonce,
    });

    const res = await getCallback(exchangerReturning(idToken), { code: 'whatever', state });

    await expectErrorRelay(res, 'auth_failed');
  });

  it('relays server_error (not auth_failed) when the JWKS lookup itself fails', async () => {
    const state = await fetchStartState('cuewise://auth');
    const { errors } = await import('jose');
    const app = createApp({
      googleVerifier: async () => {
        throw new errors.JWKSTimeout();
      },
      googleCodeExchanger: exchangerReturning('any-token'),
    });

    const res = await app.request(
      `/v1/auth/google/callback?${new URLSearchParams({ code: 'x', state }).toString()}`,
      { method: 'GET' },
      testEnv()
    );

    await expectErrorRelay(res, 'server_error');
  });
});

describe('exchangeGoogleCode (default exchanger)', () => {
  function stubFetchOnce(response: Response | Error): ReturnType<typeof vi.fn> {
    const fetchStub = vi.fn(async () => {
      if (response instanceof Error) {
        throw response;
      }
      return response;
    });
    vi.stubGlobal('fetch', fetchStub);
    return fetchStub;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the id_token on a well-formed 2xx', async () => {
    stubFetchOnce(new Response(JSON.stringify({ id_token: 'jwt-here' }), { status: 200 }));
    await expect(exchangeGoogleCode('code', testEnv())).resolves.toEqual({
      ok: true,
      idToken: 'jwt-here',
    });
  });

  it('classifies a client-config OAuth error (invalid_client) as transient and logs an error', async () => {
    const errorSpy = spyOnLoggerError();
    stubFetchOnce(new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }));
    await expect(exchangeGoogleCode('code', testEnv())).resolves.toEqual({
      ok: false,
      kind: 'transient',
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('classifies invalid_grant (a bad/replayed code) as token_fault', async () => {
    stubFetchOnce(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    await expect(exchangeGoogleCode('code', testEnv())).resolves.toEqual({
      ok: false,
      kind: 'token_fault',
    });
  });

  it('classifies a Google 5xx as transient', async () => {
    stubFetchOnce(new Response('bad gateway', { status: 502 }));
    await expect(exchangeGoogleCode('code', testEnv())).resolves.toEqual({
      ok: false,
      kind: 'transient',
    });
  });

  it('classifies a rejected fetch (network) as transient', async () => {
    stubFetchOnce(new Error('connection reset'));
    await expect(exchangeGoogleCode('code', testEnv())).resolves.toEqual({
      ok: false,
      kind: 'transient',
    });
  });

  it('classifies a 2xx missing the id_token as transient — a Google anomaly, not a user fault', async () => {
    stubFetchOnce(new Response(JSON.stringify({ access_token: 'only' }), { status: 200 }));
    await expect(exchangeGoogleCode('code', testEnv())).resolves.toEqual({
      ok: false,
      kind: 'transient',
    });
  });

  it('classifies a 2xx with an unparseable body as transient', async () => {
    stubFetchOnce(new Response('not json', { status: 200 }));
    await expect(exchangeGoogleCode('code', testEnv())).resolves.toEqual({
      ok: false,
      kind: 'transient',
    });
  });

  it('sends the code, client credentials, and redirect_uri as form params', async () => {
    const fetchStub = stubFetchOnce(
      new Response(JSON.stringify({ id_token: 'jwt' }), { status: 200 })
    );
    await exchangeGoogleCode('the-auth-code', testEnv());
    const [url, init] = fetchStub.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.body.get('code')).toBe('the-auth-code');
    expect(init.body.get('grant_type')).toBe('authorization_code');
    expect(init.body.get('client_id')).toBe(GOOGLE_CLIENT);
    expect(init.body.get('client_secret')).toBe('google-test-client-secret');
    expect(init.body.get('redirect_uri')).toBe(`${env.PUBLIC_BASE_URL}/v1/auth/google/callback`);
  });
});

/** Runs the full start → callback flow and returns the minted one-time code. */
async function mintCode(sub: string): Promise<string> {
  const { state, idToken } = await arrangeCallback(sub);
  const res = await getCallback(exchangerReturning(idToken), { code: 'google-auth-code', state });
  const code = (await deepLinkTarget(res)).searchParams.get('code');
  if (code === null) {
    throw new Error('Expected a code param on the /v1/auth/google/callback interstitial');
  }
  return code;
}

async function exchangeCode(provider: 'google' | 'apple', code: string, codeVerifier?: string) {
  const body: Record<string, unknown> = { provider, credential: code, deviceName: 'Mac' };
  if (codeVerifier !== undefined) {
    body.codeVerifier = codeVerifier;
  }
  return appWith(exchangerReturning('unused')).request(
    '/v1/auth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    testEnv()
  );
}

describe('POST /v1/auth/token with a google bounced code', () => {
  it('exchanges the minted code for a session token exactly once', async () => {
    const code = await mintCode('google-sub-redeem');

    const firstExchange = await exchangeCode('google', code, CODE_VERIFIER);
    expect(firstExchange.status).toBe(200);
    const tokenBody = await firstExchange.json<{ token: string }>();
    expect(tokenBody.token.length).toBeGreaterThan(20);

    const secondExchange = await exchangeCode('google', code, CODE_VERIFIER);
    expect(secondExchange.status).toBe(401);
    const secondBody = await secondExchange.json<{ code: string }>();
    expect(secondBody.code).toBe('invalid_token');
  });

  it('rejects a wrong codeVerifier and burns the code so a retry also fails', async () => {
    const code = await mintCode('google-sub-pkce');

    const wrongExchange = await exchangeCode('google', code, 'b'.repeat(43));
    expect(wrongExchange.status).toBe(401);
    const wrongBody = await wrongExchange.json<{ code: string }>();
    expect(wrongBody.code).toBe('invalid_token');

    const retryExchange = await exchangeCode('google', code, CODE_VERIFIER);
    expect(retryExchange.status).toBe(401);
    const retryBody = await retryExchange.json<{ code: string }>();
    expect(retryBody.code).toBe('invalid_token');
  });

  it('rejects a google-minted code redeemed under provider apple (cross-provider confusion)', async () => {
    const code = await mintCode('google-sub-cross');

    const res = await exchangeCode('apple', code, CODE_VERIFIER);

    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });

  it('treats a google exchange without codeVerifier as an id_token exchange (extension path)', async () => {
    // A bounced code is not a JWT, so the id_token verifier must 401 it rather than redeem it.
    const code = await mintCode('google-sub-no-verifier');

    const res = await exchangeCode('google', code);

    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
  });

  it('rejects a codeVerifier on a dev exchange as invalid_request', async () => {
    const res = await appWith(exchangerReturning('unused')).request(
      '/v1/auth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'dev',
          credential: 'dev-account',
          deviceName: 'Mac',
          codeVerifier: CODE_VERIFIER,
        }),
      },
      { ...testEnv(), DEV_FAKE_AUTH: '1' }
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/codeVerifier')).toBe(true);
  });

  it('rejects a malformed codeVerifier on a google exchange without burning the code', async () => {
    const code = await mintCode('google-sub-malformed-verifier');

    const res = await exchangeCode('google', code, 'too-short');
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string; errors: { pointer?: string }[] }>();
    expect(body.code).toBe('invalid_request');
    expect(body.errors.some((e) => e.pointer === '/codeVerifier')).toBe(true);

    // Proves parseTokenRequest rejected it before consumeAuthCode ran: the code is still live.
    const retryExchange = await exchangeCode('google', code, CODE_VERIFIER);
    expect(retryExchange.status).toBe(200);
  });
});
