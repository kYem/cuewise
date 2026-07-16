import { logger } from '@cuewise/shared';
import type { Env } from '../env';

// S256 PKCE challenges are always exactly 43 base64url characters (a 32-byte SHA-256 digest).
export const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

/** The HMAC-signed `state` payload every server-bounce provider (Apple, Google) signs. */
export interface BounceState {
  returnUri: string;
  codeChallenge: string;
  nonce: string;
}

/** Narrows a verified-but-untyped `state` payload; shape only, signature already checked. */
export function toBounceState(parsed: unknown): BounceState | null {
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    typeof (parsed as { returnUri?: unknown }).returnUri === 'string' &&
    typeof (parsed as { codeChallenge?: unknown }).codeChallenge === 'string' &&
    typeof (parsed as { nonce?: unknown }).nonce === 'string'
  ) {
    return parsed as BounceState;
  }
  return null;
}

export function isAllowedReturnUri(uri: string, env: Env): boolean {
  return env.ALLOWED_RETURN_URIS.split(',').some((allowed) => uri === allowed.trim());
}

/** Fails closed on a missing signing key; the key itself is never logged. */
export function requireStateSigningKey(env: Env): string | null {
  if (!env.STATE_SIGNING_KEY) {
    logger.error('STATE_SIGNING_KEY is not configured');
    return null;
  }
  return env.STATE_SIGNING_KEY;
}
