import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestIdp, type TestIdp } from '../__fixtures__/jwks.fixtures';
import { spyOnLoggerError } from '../__fixtures__/logger.fixtures';
import { base64UrlEncodeString, sha256Base64Url, signState } from '../crypto-utils';
import { createApp } from '../index';
import type { GoogleCodeExchanger } from './google';

const GOOGLE_ISS = 'https://accounts.google.com';
const GOOGLE_CLIENT = 'google-client';
// Fixed 43-char base64url verifier; no randomness needed for PKCE binding tests.
const CODE_VERIFIER = 'a'.repeat(43);
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

interface DecodedGoogleState {
  returnUri: string;
  codeChallenge: string;
  nonce: string;
}

/** Reads the plaintext payload of a `signState` output; does not verify the signature. */
function decodeState(state: string): DecodedGoogleState {
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

  it('returns 500 internal when STATE_SIGNING_KEY is unset', async () => {
    const res = await getStart('cuewise://auth', CODE_CHALLENGE, { STATE_SIGNING_KEY: '' });
    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('returns 500 internal when GOOGLE_OAUTH_CLIENT_ID is unset (fails closed)', async () => {
    const errorSpy = spyOnLoggerError();
    const res = await getStart('cuewise://auth', CODE_CHALLENGE, { GOOGLE_OAUTH_CLIENT_ID: '' });
    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(res.headers.get('Location')).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('GET /v1/auth/google/callback', () => {
  it('redirects to returnUri with a code param on a successful exchange + verification', async () => {
    const { state, idToken } = await arrangeCallback('google-sub-happy');
    const exchanger = vi.fn(exchangerReturning(idToken));

    const res = await getCallback(exchanger, { code: 'google-auth-code', state });

    expect(res.status).toBe(302);
    const location = requireHeader(res, 'Location');
    expect(location.startsWith('cuewise://auth?')).toBe(true);
    expect(new URL(location).searchParams.get('code')).not.toBeNull();
    expect(exchanger).toHaveBeenCalledWith('google-auth-code', expect.anything());
  });

  it('relays a user cancel as error=access_denied on the returnUri without exchanging', async () => {
    const state = await fetchStartState('cuewise://auth');
    const exchanger = vi.fn(exchangerReturning('unused'));

    const res = await getCallback(exchanger, { error: 'access_denied', state });

    expect(res.status).toBe(302);
    const url = new URL(requireHeader(res, 'Location'));
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('code')).toBeNull();
    expect(exchanger).not.toHaveBeenCalled();
  });

  it('collapses an unknown OAuth error value to auth_failed', async () => {
    const state = await fetchStartState('cuewise://auth');

    const res = await getCallback(exchangerReturning('unused'), {
      error: 'temporarily_unavailable"><script>alert(1)</script>',
      state,
    });

    expect(res.status).toBe(302);
    const url = new URL(requireHeader(res, 'Location'));
    expect(url.searchParams.get('error')).toBe('auth_failed');
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

  it('rejects a missing code when no error is present', async () => {
    const state = await fetchStartState('cuewise://auth');
    const res = await getCallback(exchangerReturning('unused'), { state });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
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

  it('returns 500 internal without exchanging when GOOGLE_CLIENT_SECRET is unset', async () => {
    const errorSpy = spyOnLoggerError();
    const state = await fetchStartState('cuewise://auth');
    const exchanger = vi.fn(exchangerReturning('unused'));

    const res = await getCallback(
      exchanger,
      { code: 'whatever', state },
      { GOOGLE_CLIENT_SECRET: '' }
    );

    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(exchanger).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('answers 401 invalid_token when the code exchange reports a token fault', async () => {
    const state = await fetchStartState('cuewise://auth');
    const exchanger: GoogleCodeExchanger = async () => ({ ok: false, kind: 'token_fault' });

    const res = await getCallback(exchanger, { code: 'bad-code', state });

    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('answers 500 internal when the code exchange reports a transient fault', async () => {
    const state = await fetchStartState('cuewise://auth');
    const exchanger: GoogleCodeExchanger = async () => ({ ok: false, kind: 'transient' });

    const res = await getCallback(exchanger, { code: 'whatever', state });

    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('rejects an ID token whose nonce does not match the state nonce', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: GOOGLE_ISS,
      aud: GOOGLE_CLIENT,
      sub: 'google-sub-nonce-mismatch',
      nonce: 'a-different-nonce-entirely',
    });

    const res = await getCallback(exchangerReturning(idToken), { code: 'whatever', state });

    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('rejects an ID token that carries no nonce claim at all', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: GOOGLE_ISS,
      aud: GOOGLE_CLIENT,
      sub: 'google-sub-no-nonce',
    });

    const res = await getCallback(exchangerReturning(idToken), { code: 'whatever', state });

    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
    expect(res.headers.get('Location')).toBeNull();
  });

  it('rejects a bad-audience ID token without redirecting with a code', async () => {
    const state = await fetchStartState('cuewise://auth');
    const idToken = await idp.sign({
      iss: GOOGLE_ISS,
      aud: 'evil-client',
      sub: 'google-sub-bad-aud',
      nonce: decodeState(state).nonce,
    });

    const res = await getCallback(exchangerReturning(idToken), { code: 'whatever', state });

    expect(res.status).toBe(401);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_token');
    expect(res.headers.get('Location')).toBeNull();
  });
});
