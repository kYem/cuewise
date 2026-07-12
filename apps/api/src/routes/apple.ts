import { logger } from '@cuewise/shared';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import { randomToken, signState, verifyState } from '../crypto-utils';
import type { Env } from '../env';
import type { AppDepsResolved } from '../index';
import { problem, type ValidationIssue } from '../problem-details';
import { verifyOrProblem } from '../verifiers';

// S256 PKCE challenges are always exactly 43 base64url characters (a 32-byte SHA-256 digest).
const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

interface AppleState {
  returnUri: string;
  codeChallenge: string;
  nonce: string;
}

/** Narrows a verified-but-untyped `state` payload; shape only, signature already checked. */
function toAppleState(parsed: unknown): AppleState | null {
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    typeof (parsed as { returnUri?: unknown }).returnUri === 'string' &&
    typeof (parsed as { codeChallenge?: unknown }).codeChallenge === 'string' &&
    typeof (parsed as { nonce?: unknown }).nonce === 'string'
  ) {
    return parsed as AppleState;
  }
  return null;
}

function isAllowedReturnUri(uri: string, env: Env): boolean {
  return env.ALLOWED_RETURN_URIS.split(',').some((allowed) => uri === allowed.trim());
}

/** Fails closed on a missing signing key; the key itself is never logged. */
function requireStateSigningKey(env: Env): string | null {
  if (!env.STATE_SIGNING_KEY) {
    logger.error('STATE_SIGNING_KEY is not configured');
    return null;
  }
  return env.STATE_SIGNING_KEY;
}

export function registerAppleRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.get('/v1/auth/apple/start', async (c) => {
    const signingKey = requireStateSigningKey(c.env);
    if (signingKey === null) {
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
    const url = new URL('https://appleid.apple.com/auth/authorize');
    url.searchParams.set('client_id', c.env.APPLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${c.env.PUBLIC_BASE_URL}/v1/auth/apple/callback`);
    url.searchParams.set('response_type', 'code id_token');
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('scope', 'email');
    url.searchParams.set('nonce', nonce);
    const state = await signState({ returnUri, codeChallenge, nonce }, signingKey);
    url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  app.post('/v1/auth/apple/callback', async (c) => {
    const signingKey = requireStateSigningKey(c.env);
    if (signingKey === null) {
      return problem('internal');
    }
    const form = await c.req.parseBody();
    const idToken = form.id_token;
    const state = form.state;
    if (typeof idToken !== 'string' || typeof state !== 'string') {
      return problem('invalid_request', { detail: 'id_token and state are required.' });
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
    const decoded = toAppleState(verifyResult.payload);
    if (decoded === null || !isAllowedReturnUri(decoded.returnUri, c.env)) {
      return problem('invalid_request', { detail: 'Bad state.' });
    }
    const verified = await verifyOrProblem(deps.appleVerifier, idToken, c.env, 'Apple');
    if (verified instanceof Response) {
      return verified;
    }
    // The state is HMAC-signed, so a matching nonce proves this ID token was minted
    // for a flow this server started — not forged or replayed from elsewhere.
    if (verified.nonce === undefined || verified.nonce !== decoded.nonce) {
      // A validly-signed Apple token with the wrong nonce is a replay into a flow it wasn't
      // minted for — the exact attack the nonce exists to stop, so it must be visible.
      logger.warn('Apple callback ID token nonce did not match the state nonce');
      return problem('invalid_token');
    }
    const code = await deps.storeFactory(c.env.DB).mintAuthCode(
      {
        provider: 'apple',
        providerSub: verified.providerSub,
        email: verified.email,
      },
      decoded.codeChallenge
    );
    const target = new URL(decoded.returnUri);
    target.searchParams.set('code', code);
    return c.redirect(target.toString(), 302);
  });
}
