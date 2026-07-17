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
  // token_fault: this grant is provably bad (replayed/expired/forged code).
  // transient: Google outage, network failure, or our own client config rejected — retryable
  // from the user's perspective once the server side is fixed.
  | { ok: false; kind: 'token_fault' | 'transient' };

/**
 * Trades a Google authorization code for an id_token; the DI seam route tests fake.
 * Implementations must never reject — failures are returned as data (GoogleCodeExchangeResult),
 * since a rejection past state verification would strand the app on a problem+json page.
 */
export type GoogleCodeExchanger = (code: string, env: Env) => Promise<GoogleCodeExchangeResult>;

// OAuth error codes that mean OUR client config is broken (secret, redirect URI), not the
// grant — must surface as a loud server fault, never as a user-visible "bad token".
const CONFIG_FAULT_ERRORS = new Set([
  'invalid_client',
  'unauthorized_client',
  'redirect_uri_mismatch',
]);

/**
 * Reads only the OAuth `error` enum from a token-endpoint failure body. Never the body itself
 * and never `error_description` — both can echo request inputs, which are never logged.
 */
async function readOAuthErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown };
    // Enum-shaped values only — anything else is not an RFC 6749 error code and never
    // reaches a log line.
    if (typeof body.error === 'string' && /^[a-z_]{1,64}$/.test(body.error)) {
      return body.error;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Default exchanger: the confidential-client leg Apple's form_post flow doesn't need.
 * Logs statuses and the error enum only — the response body can echo the code.
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
    const errorCode = await readOAuthErrorCode(res);
    if (errorCode !== null && CONFIG_FAULT_ERRORS.has(errorCode)) {
      // A rotated/mistyped secret or unregistered redirect URI fails every sign-in fleet-wide;
      // it must be loud and 500-shaped, not blend in with bad-code replay noise.
      logger.error(
        `Google code exchange rejected as a client-config fault (${errorCode}, status ${res.status})`
      );
      return { ok: false, kind: 'transient' };
    }
    if (res.status >= 400 && res.status < 500) {
      logger.warn(
        `Google code exchange rejected (status ${res.status}${errorCode === null ? '' : `, ${errorCode}`})`
      );
      return { ok: false, kind: 'token_fault' };
    }
    logger.error(`Google token endpoint error (status ${res.status})`);
    return { ok: false, kind: 'transient' };
  }
  // A 2xx with an unparseable body or no id_token proves nothing about the grant — that's a
  // Google-side anomaly (retryable), not a user fault.
  let idToken: unknown;
  try {
    idToken = ((await res.json()) as { id_token?: unknown }).id_token;
  } catch {
    logger.error('Google token endpoint returned a 2xx with an unparseable body');
    return { ok: false, kind: 'transient' };
  }
  if (typeof idToken !== 'string' || idToken === '') {
    logger.error('Google token endpoint response carried no id_token');
    return { ok: false, kind: 'transient' };
  }
  return { ok: true, idToken };
};

/**
 * Everything the deep link can carry back. The app maps access_denied to a user cancel,
 * auth_failed to a failed verification, server_error to a retryable server-side fault.
 */
type SanitizedOAuthError = 'access_denied' | 'auth_failed' | 'server_error';

/** Google's error values collapse to the app's vocabulary; nothing attacker-shaped rides the deep link. */
function sanitizeOAuthError(error: string): SanitizedOAuthError {
  if (error === 'access_denied') {
    return 'access_denied';
  }
  return 'auth_failed';
}

/** HTML-escapes an embedded value; deep-link URLs are server-built, but escape regardless. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Returns to the app via an interstitial page instead of a bare 302 (ENG-66): a cross-scheme
 * redirect can't close or repaint the tab it happens in, which read as "stuck on Google" in
 * live testing. The page fires the deep link (script + meta-refresh fallback) and tells the
 * user the tab is done.
 */
function respondWithDeepLink(target: URL, message: string): Response {
  const href = target.toString();
  // <-escape closes the </script> breakout hole even though href can't contain '<'.
  const jsHref = JSON.stringify(href).replaceAll('<', '\\u003c');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${escapeHtml(href)}">
<title>Cuewise</title>
</head>
<body style="font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 90vh; text-align: center;">
<p>${escapeHtml(message)} You can close this tab.<br><a href="${escapeHtml(href)}">Open Cuewise</a> if it doesn't happen automatically.</p>
<script>location.replace(${jsHref});</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // The success page embeds the one-time code — never cache it.
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Failures after the return URI is proven ours (allowlisted at /start, or HMAC-verified at the
 * callback) ride back to the app so its pending flow settles immediately — a problem+json page
 * in the browser would strand the app until its callback timeout.
 */
function redirectWithError(returnUri: string, error: SanitizedOAuthError): Response {
  const target = new URL(returnUri);
  target.searchParams.set('error', error);
  return respondWithDeepLink(target, "Sign-in didn't complete — return to Cuewise to try again.");
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
    // Config faults are checked only after the return URI is proven allowlisted, so they can
    // ride back to the app (fail closed, but without stranding the pending flow). The secret
    // is required here too — better than failing after the user completes the consent dance.
    const signingKey = requireStateSigningKey(c.env);
    if (signingKey === null) {
      return redirectWithError(returnUri, 'server_error');
    }
    if (!c.env.GOOGLE_OAUTH_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
      logger.error('Google OAuth client credentials are not configured');
      return redirectWithError(returnUri, 'server_error');
    }
    const nonce = randomToken();
    const url = new URL(GOOGLE_AUTHORIZE_URL);
    url.searchParams.set('client_id', c.env.GOOGLE_OAUTH_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${c.env.PUBLIC_BASE_URL}/v1/auth/google/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email');
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('prompt', 'select_account');
    let state: string;
    try {
      state = await signState({ returnUri, codeChallenge, nonce }, signingKey);
    } catch (err) {
      // A WebCrypto fault here is the last throwable step — relay it rather than strand the app.
      logger.error('Failed to sign the Google bounce state', err);
      return redirectWithError(returnUri, 'server_error');
    }
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
    // From here the state's HMAC proves this flow is ours and the return URI is allowlisted,
    // so every failure redirects back to the app (see redirectWithError).
    const oauthError = c.req.query('error') ?? '';
    if (oauthError !== '') {
      // Google's authorize endpoint can itself fault (RFC 6749 §4.1.2.1) — that's a retryable
      // server-side incident, not a sign-in failure, and it must be loud in our logs.
      if (oauthError === 'server_error' || oauthError === 'temporarily_unavailable') {
        logger.error(`Google authorize endpoint reported a transient fault (${oauthError})`);
        return redirectWithError(decoded.returnUri, 'server_error');
      }
      if (oauthError === 'access_denied') {
        // Not exclusively a user cancel: Google also emits access_denied for policy denials
        // (unverified app + non-tester, Workspace-blocked). The app goes quiet on it, so this
        // line is the only signal — a spike here means a verification/policy incident.
        logger.info('Google callback relayed access_denied (user cancel or policy denial)');
      } else {
        // Enum-classified message only — the raw value is attacker-shapeable, never echoed.
        logger.warn('Google callback carried a non-cancel OAuth error (collapsed to auth_failed)');
      }
      return redirectWithError(decoded.returnUri, sanitizeOAuthError(oauthError));
    }
    const code = c.req.query('code') ?? '';
    if (code === '') {
      logger.warn('Google callback arrived with neither code nor error');
      return redirectWithError(decoded.returnUri, 'auth_failed');
    }
    if (!c.env.GOOGLE_OAUTH_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
      logger.error('Google OAuth client credentials are not configured');
      return redirectWithError(decoded.returnUri, 'server_error');
    }
    const exchanged = await deps.googleCodeExchanger(code, c.env);
    if (!exchanged.ok) {
      if (exchanged.kind === 'token_fault') {
        return redirectWithError(decoded.returnUri, 'auth_failed');
      }
      return redirectWithError(decoded.returnUri, 'server_error');
    }
    const verified = await verifyOrProblem(deps.googleVerifier, exchanged.idToken, c.env, 'Google');
    if (verified instanceof Response) {
      // verifyOrProblem already classified + logged: 5xx-shaped means our upstream/config
      // failed (retryable), anything else means the token itself didn't verify.
      if (verified.status >= 500) {
        return redirectWithError(decoded.returnUri, 'server_error');
      }
      return redirectWithError(decoded.returnUri, 'auth_failed');
    }
    // The state is HMAC-signed, so a matching nonce proves this ID token was minted
    // for a flow this server started — not forged or replayed from elsewhere.
    if (verified.nonce === undefined || verified.nonce !== decoded.nonce) {
      logger.warn('Google callback ID token nonce did not match the state nonce');
      return redirectWithError(decoded.returnUri, 'auth_failed');
    }
    let authCode: string;
    try {
      authCode = await deps.storeFactory(c.env.DB).mintAuthCode(
        {
          provider: 'google',
          providerSub: verified.providerSub,
          email: verified.email,
        },
        decoded.codeChallenge
      );
    } catch (err) {
      // A D1 blip at the very last step must relay too, not strand the app on a JSON page.
      logger.error('Google callback failed to mint the auth code', err);
      return redirectWithError(decoded.returnUri, 'server_error');
    }
    const target = new URL(decoded.returnUri);
    target.searchParams.set('code', authCode);
    return respondWithDeepLink(target, 'Returning you to Cuewise…');
  });
}
