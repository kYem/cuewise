import type { ExchangeTokenRequest } from '@cuewise/shared';
import { logger } from '@cuewise/shared';
import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import { bearerToken, sha256Base64Url } from '../crypto-utils';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
import type { AppDepsResolved } from '../index';
import { problem, requireNonEmptyString, type ValidationIssue } from '../problem-details';
import type { Identity, SyncStore } from '../store';
import { verifyOrProblem } from '../verifiers';

/** localhost/loopback hosts, the only places the dev auth bypass may run. */
function isLocalhostBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/** The dev provider is a total auth bypass; honor it only on localhost, and shout if it's set elsewhere. */
function isDevAuthEnabled(env: Env): boolean {
  if (env.DEV_FAKE_AUTH !== '1') {
    return false;
  }
  if (!isLocalhostBaseUrl(env.PUBLIC_BASE_URL)) {
    logger.error(
      'DEV_FAKE_AUTH is enabled but PUBLIC_BASE_URL is not localhost; refusing the dev auth bypass'
    );
    return false;
  }
  return true;
}

const MAX_DEVICE_NAME_LENGTH = 100;
// Real ID tokens run 1-2 KB and Apple's one-time code is 43 chars; this just caps abuse.
const MAX_CREDENTIAL_LENGTH = 8192;
// RFC 7636 §4.1: a PKCE code_verifier is 43-128 characters from the unreserved set
// [A-Za-z0-9._~-]. ASCII-only, so byte length and character length are provably identical.
const MIN_CODE_VERIFIER_LENGTH = 43;
const MAX_CODE_VERIFIER_LENGTH = 128;
const CODE_VERIFIER_RE = new RegExp(
  `^[A-Za-z0-9._~-]{${MIN_CODE_VERIFIER_LENGTH},${MAX_CODE_VERIFIER_LENGTH}}$`
);

/** Picks the most specific violation for a failing `CODE_VERIFIER_RE` test; the regex still decides pass/fail. */
function codeVerifierIssue(value: unknown): ValidationIssue {
  const pointer = '/codeVerifier';
  if (typeof value !== 'string' || value === '') {
    return { pointer, detail: 'required non-empty string' };
  }
  if (value.length < MIN_CODE_VERIFIER_LENGTH) {
    return { pointer, detail: `must be at least ${MIN_CODE_VERIFIER_LENGTH} characters` };
  }
  if (value.length > MAX_CODE_VERIFIER_LENGTH) {
    return { pointer, detail: `must not exceed ${MAX_CODE_VERIFIER_LENGTH} characters` };
  }
  return {
    pointer,
    detail: 'must contain only characters from the unreserved set [A-Za-z0-9._~-]',
  };
}

function parseTokenRequest(body: unknown): ExchangeTokenRequest | ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const b = (body ?? {}) as Record<string, unknown>;
  const { provider, credential, deviceName, codeVerifier } = b;
  if (provider !== 'google' && provider !== 'apple' && provider !== 'dev') {
    issues.push({ pointer: '/provider', detail: "must be 'google', 'apple', or 'dev'" });
  }
  requireNonEmptyString(credential, '/credential', issues, { maxLength: MAX_CREDENTIAL_LENGTH });
  requireNonEmptyString(deviceName, '/deviceName', issues, { maxLength: MAX_DEVICE_NAME_LENGTH });
  // codeVerifier: required for apple, optional for google (present = bounced-code exchange),
  // meaningless for dev — rejected there so a typo'd request can't silently no-op.
  if (provider === 'apple' || (provider === 'google' && codeVerifier !== undefined)) {
    // Bounded (length + charset) before consumeAuthCode ever runs, so malformed input can't burn the code.
    if (typeof codeVerifier !== 'string' || !CODE_VERIFIER_RE.test(codeVerifier)) {
      issues.push(codeVerifierIssue(codeVerifier));
    }
  } else if (provider === 'dev' && codeVerifier !== undefined) {
    issues.push({ pointer: '/codeVerifier', detail: "not allowed for provider 'dev'" });
  }
  if (issues.length > 0) {
    return issues;
  }
  // Construct each arm from validated locals instead of casting `b` — adding a union field then
  // breaks compilation here rather than silently smuggling an unchecked value downstream.
  const base = { credential: credential as string, deviceName: deviceName as string };
  if (provider === 'apple') {
    return { provider, ...base, codeVerifier: codeVerifier as string };
  }
  if (provider === 'google' && codeVerifier !== undefined) {
    return { provider, ...base, codeVerifier: codeVerifier as string };
  }
  return { provider: provider as 'google' | 'dev', ...base };
}

/**
 * Redeems a server-bounce one-time code: atomic burn, then the PKCE check, then a
 * provider cross-check so a code minted for one provider can't be redeemed as another.
 */
async function redeemBouncedCode(
  store: SyncStore,
  provider: 'apple' | 'google',
  credential: string,
  codeVerifier: string
): Promise<Identity | Response> {
  const consumed = await store.consumeAuthCode(credential);
  if (consumed === null) {
    return problem('invalid_token');
  }
  // The code is already burned here; a verifier mismatch fails closed rather than
  // leaving the code redeemable for a retry.
  const computedChallenge = await sha256Base64Url(codeVerifier);
  if (computedChallenge !== consumed.codeChallenge) {
    // A redeemed code with the wrong verifier is the exact attack PKCE exists to stop; the
    // code is already burned, so this is the only record it ever happened. Metadata only.
    logger.warn(`${provider} auth-code exchange failed PKCE verifier check`);
    return problem('invalid_token');
  }
  if (consumed.payload.provider !== provider) {
    logger.warn(
      `auth-code exchange provider mismatch: request said ${provider}, code was minted for ${consumed.payload.provider}`
    );
    return problem('invalid_token');
  }
  return {
    provider: consumed.payload.provider,
    providerSub: consumed.payload.providerSub,
    email: consumed.payload.email,
  };
}

export function registerAuthRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.post('/v1/auth/token', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
    }
    const parsed = parseTokenRequest(raw);
    if (Array.isArray(parsed)) {
      return problem('invalid_request', { errors: parsed });
    }
    const store = deps.storeFactory(c.env.DB);
    let identity: Identity;
    if ('codeVerifier' in parsed) {
      // apple always, google when the credential is a bounced one-time code (macOS deep-link flow).
      const redeemed = await redeemBouncedCode(
        store,
        parsed.provider,
        parsed.credential,
        parsed.codeVerifier
      );
      if (redeemed instanceof Response) {
        return redeemed;
      }
      identity = redeemed;
    } else if (parsed.provider === 'google') {
      const verified = await verifyOrProblem(
        deps.googleVerifier,
        parsed.credential,
        c.env,
        'Google'
      );
      if (verified instanceof Response) {
        return verified;
      }
      identity = { provider: 'google', providerSub: verified.providerSub, email: verified.email };
    } else if (parsed.provider === 'dev') {
      if (!isDevAuthEnabled(c.env)) {
        return problem('invalid_request', { detail: 'Unknown provider.' });
      }
      identity = { provider: 'dev', providerSub: parsed.credential };
    } else {
      // Unreachable: parseTokenRequest already rejects any provider outside this set.
      return problem('invalid_request', { detail: 'Unknown provider.' });
    }
    const userId = await store.findOrCreateUser(identity);
    const token = await store.createSession(userId, parsed.deviceName);
    return c.json({ token });
  });

  app.post('/v1/auth/logout', async (c) => {
    const rawToken = bearerToken(c.req.header('Authorization'));
    if (rawToken !== null) {
      await deps.storeFactory(c.env.DB).revokeSession(rawToken);
    }
    return c.body(null, 204);
  });
}
