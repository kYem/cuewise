import { logger } from '@cuewise/shared';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import { randomToken, signState, verifyState } from '../crypto-utils';
import type { Env } from '../env';
import type { AppDepsResolved } from '../index';
import { problem, type ValidationIssue } from '../problem-details';
import { verifyOrProblem } from '../verifiers';
import {
  CODE_CHALLENGE_RE,
  isAllowedReturnUri,
  requireStateSigningKey,
  toBounceState,
} from './bounce-shared';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleCodeExchangeResult =
  | { ok: true; idToken: string }
  // token_fault: this grant is provably bad (Google 4xx / no id_token) → 401.
  // transient: Google outage or network failure → 500, retryable client-side.
  | { ok: false; kind: 'token_fault' | 'transient' };

/** Trades a Google authorization code for an id_token; the DI seam route tests fake. */
export type GoogleCodeExchanger = (code: string, env: Env) => Promise<GoogleCodeExchangeResult>;

/**
 * Default exchanger: the confidential-client leg Apple's form_post flow doesn't need.
 * Logs statuses only — the response body can echo the code, so it is never logged.
 */
export const exchangeGoogleCode: GoogleCodeExchanger = async (code, env) => {
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${env.PUBLIC_BASE_URL}/v1/auth/google/callback`,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
      }),
    });
  } catch (err) {
    logger.error('Google token endpoint unreachable', err);
    return { ok: false, kind: 'transient' };
  }
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      logger.warn(`Google code exchange rejected (status ${res.status})`);
      return { ok: false, kind: 'token_fault' };
    }
    logger.error(`Google token endpoint error (status ${res.status})`);
    return { ok: false, kind: 'transient' };
  }
  let idToken: unknown;
  try {
    idToken = ((await res.json()) as { id_token?: unknown }).id_token;
  } catch {
    logger.warn('Google token endpoint returned a 2xx with an unparseable body');
    return { ok: false, kind: 'token_fault' };
  }
  if (typeof idToken !== 'string' || idToken === '') {
    logger.warn('Google token endpoint response carried no id_token');
    return { ok: false, kind: 'token_fault' };
  }
  return { ok: true, idToken };
};

/** Only OAuth error values the app reacts to pass through to the deep link; the rest collapse. */
function sanitizeOAuthError(error: string): string {
  if (error === 'access_denied') {
    return 'access_denied';
  }
  return 'auth_failed';
}

/**
 * The Google server bounce (mirrors ./apple.ts): /start signs state and hands off to Google;
 * /callback trades the auth code for an id_token server-side, verifies it, and mints the same
 * one-time PKCE-bound code Apple uses. No token ever rides the cuewise:// URL.
 */
export function registerGoogleRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.get('/v1/auth/google/start', async (c) => {
    const signingKey = requireStateSigningKey(c.env);
    if (signingKey === null) {
      return problem('internal');
    }
    if (!c.env.GOOGLE_OAUTH_CLIENT_ID) {
      logger.error('GOOGLE_OAUTH_CLIENT_ID is not configured');
      return problem('internal');
    }
    const returnUri = c.req.query('return_uri') ?? '';
    const codeChallenge = c.req.query('code_challenge') ?? '';
    const issues: ValidationIssue[] = [];
    if (!isAllowedReturnUri(returnUri, c.env)) {
      issues.push({ pointer: '/return_uri', detail: 'return_uri is not allowlisted.' });
    }
    if (!CODE_CHALLENGE_RE.test(codeChallenge)) {
      issues.push({
        pointer: '/code_challenge',
        detail: 'code_challenge must be exactly 43 base64url characters.',
      });
    }
    if (issues.length > 0) {
      return problem('invalid_request', { errors: issues });
    }
    const nonce = randomToken();
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set('client_id', c.env.GOOGLE_OAUTH_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${c.env.PUBLIC_BASE_URL}/v1/auth/google/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email');
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('prompt', 'select_account');
    const state = await signState({ returnUri, codeChallenge, nonce }, signingKey);
    url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  app.get('/v1/auth/google/callback', async (c) => {
    const signingKey = requireStateSigningKey(c.env);
    if (signingKey === null) {
      return problem('internal');
    }
    const state = c.req.query('state') ?? '';
    if (state === '') {
      return problem('invalid_request', { detail: 'state is required.' });
    }
    const verifyResult = await verifyState(state, signingKey);
    if (!verifyResult.ok) {
      // key_unavailable is a server/config fault (transient WebCrypto issue), not a bad
      // client request — the other reasons all mean this state was never ours.
      if (verifyResult.reason === 'key_unavailable') {
        return problem('internal');
      }
      return problem('invalid_request', { detail: 'Bad state.' });
    }
    const decoded = toBounceState(verifyResult.payload);
    if (decoded === null || !isAllowedReturnUri(decoded.returnUri, c.env)) {
      return problem('invalid_request', { detail: 'Bad state.' });
    }
    // A user cancel/denial at Google arrives as ?error= — relayed only after the state
    // proved this flow was ours, and sanitized so no attacker-shaped string rides the deep link.
    const oauthError = c.req.query('error') ?? '';
    if (oauthError !== '') {
      const target = new URL(decoded.returnUri);
      target.searchParams.set('error', sanitizeOAuthError(oauthError));
      return c.redirect(target.toString(), 302);
    }
    const code = c.req.query('code') ?? '';
    if (code === '') {
      return problem('invalid_request', { detail: 'code is required.' });
    }
    if (!c.env.GOOGLE_OAUTH_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
      logger.error('Google OAuth client credentials are not configured');
      return problem('internal');
    }
    const exchanged = await deps.googleCodeExchanger(code, c.env);
    if (!exchanged.ok) {
      if (exchanged.kind === 'token_fault') {
        return problem('invalid_token');
      }
      return problem('internal');
    }
    const verified = await verifyOrProblem(deps.googleVerifier, exchanged.idToken, c.env, 'Google');
    if (verified instanceof Response) {
      return verified;
    }
    // The state is HMAC-signed, so a matching nonce proves this ID token was minted
    // for a flow this server started — not forged or replayed from elsewhere.
    if (verified.nonce === undefined || verified.nonce !== decoded.nonce) {
      logger.warn('Google callback ID token nonce did not match the state nonce');
      return problem('invalid_token');
    }
    const authCode = await deps.storeFactory(c.env.DB).mintAuthCode(
      {
        provider: 'google',
        providerSub: verified.providerSub,
        email: verified.email,
      },
      decoded.codeChallenge
    );
    const target = new URL(decoded.returnUri);
    target.searchParams.set('code', authCode);
    return c.redirect(target.toString(), 302);
  });
}
