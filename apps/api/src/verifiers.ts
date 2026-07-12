import { logger } from '@cuewise/shared';
import { createRemoteJWKSet, errors, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from 'jose';
import type { Env } from './env';
import { problem } from './problem-details';

export interface VerifiedIdentity {
  providerSub: string;
  email?: string;
  // Only Apple's flow sets/checks this; Google's OAuth flow doesn't send a nonce.
  nonce?: string;
}

export type IdTokenVerifier = (idToken: string, env: Env) => Promise<VerifiedIdentity>;

/** A verified-but-rejected token (e.g. missing claim); distinct from an upstream/network failure. */
export class TokenVerificationError extends Error {}

/** A required env var (e.g. an audience client-id) is empty — a server misconfig, not a bad token. */
export class ConfigError extends Error {}

const TOKEN_FAULT_CLASSES = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
] as const;

/** True when the failure proves the presented token is bad; anything else is an upstream outage. */
export function isTokenFault(err: unknown): boolean {
  if (err instanceof TokenVerificationError) {
    return true;
  }
  return TOKEN_FAULT_CLASSES.some((cls) => err instanceof cls);
}

/** Apple sends `email_verified` as the string 'true'/'false'; Google sends a boolean. */
export function isEmailVerified(payload: JWTPayload): boolean {
  return payload.email_verified === true || payload.email_verified === 'true';
}

interface IdTokenVerifierConfig {
  // Accepts both createRemoteJWKSet (prod) and createLocalJWKSet (tests) — the fixture routes
  // through this same factory so the deployed verifier is what the suite actually exercises.
  jwks: JWTVerifyGetKey;
  issuer: string | string[];
  audience: (env: Env) => string | string[];
  label: string;
}

/** Throws ConfigError on an empty audience so an unprovisioned client-id fails closed (500), not open. */
function resolveAudience(config: IdTokenVerifierConfig, env: Env): string | string[] {
  const audience = config.audience(env);
  const values = typeof audience === 'string' ? [audience] : audience;
  if (values.length === 0 || values.every((value) => value === '')) {
    throw new ConfigError(`${config.label} audience is not configured`);
  }
  return audience;
}

/** Builds a provider ID-token verifier: same claim checks, only issuer/audience differ. */
export function createIdTokenVerifier(config: IdTokenVerifierConfig): IdTokenVerifier {
  return async (idToken, env) => {
    // Resolve+validate the audience before jwtVerify: an empty string is falsy and would make
    // jose skip the aud check entirely (fail-open), so we reject it here instead.
    const audience = resolveAudience(config, env);
    // Pin RS256 (what Google and Apple both sign with) so a token can't dictate its own algorithm.
    const { payload } = await jwtVerify(idToken, config.jwks, {
      issuer: config.issuer,
      audience,
      algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string') {
      throw new TokenVerificationError('ID token missing sub');
    }
    return {
      providerSub: payload.sub,
      email:
        typeof payload.email === 'string' && isEmailVerified(payload) ? payload.email : undefined,
      nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
    };
  };
}

/** Splits a comma-separated client-id list, trimming whitespace and dropping empty entries. */
export function parseClientIds(raw: string): string[] {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const verifyGoogleIdToken = createIdTokenVerifier({
  jwks: googleJwks,
  issuer: ['https://accounts.google.com', 'accounts.google.com'],
  audience: (env) => parseClientIds(env.GOOGLE_CLIENT_IDS),
  label: 'Google',
});

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export const verifyAppleIdToken = createIdTokenVerifier({
  jwks: appleJwks,
  issuer: 'https://appleid.apple.com',
  audience: (env) => env.APPLE_CLIENT_ID,
  label: 'Apple',
});

/** Runs `verifier`, turning a rejection into a bad-token 401 or an upstream-outage 500. */
export async function verifyOrProblem(
  verifier: IdTokenVerifier,
  credential: string,
  env: Env,
  providerLabel: string
): Promise<VerifiedIdentity | Response> {
  try {
    return await verifier(credential, env);
  } catch (err) {
    // A missing/empty client-id (audience) is a server misconfig, not attacker input — must be
    // loud and answered 500, never folded into the bad-token 401 path below.
    if (err instanceof ConfigError) {
      logger.error(`${providerLabel} verifier is misconfigured`, { message: err.message });
      return problem('internal');
    }
    // Only known token-fault classes are treated as a bad token; anything else
    // (e.g. JWKS outage) is an upstream failure — 500 so the client's retry loop engages.
    if (isTokenFault(err)) {
      // Every token fault is a probing signal worth a metadata-only warn, except JWTExpired/
      // JWTClaimValidationFailed — routine noise from clock skew and stale clients.
      if (err instanceof errors.JWKSNoMatchingKey) {
        // Providers pre-publish rotated keys and jose refetches on a kid miss outside its 30s
        // cooldown, so an unmatched kid is overwhelmingly a bogus token, not a rotation race.
        logger.warn(`${providerLabel} ID token had no matching JWKS key`, { code: err.code });
      } else if (err instanceof errors.JWSSignatureVerificationFailed) {
        logger.warn(`${providerLabel} ID token had an invalid signature`, { code: err.code });
      } else if (err instanceof errors.JOSEAlgNotAllowed) {
        logger.warn(`${providerLabel} ID token used a disallowed algorithm`, { code: err.code });
      } else if (err instanceof errors.JOSENotSupported) {
        logger.warn(`${providerLabel} ID token used an unsupported algorithm`, { code: err.code });
      } else if (err instanceof errors.JWTInvalid) {
        logger.warn(`${providerLabel} ID token was structurally malformed`, { code: err.code });
      } else if (err instanceof errors.JWSInvalid) {
        logger.warn(`${providerLabel} ID token's signature was structurally malformed`, {
          code: err.code,
        });
      } else if (err instanceof errors.JWTClaimValidationFailed) {
        // An aud/iss mismatch is an integration bug or audience-confusion probe worth surfacing;
        // other claim failures (nbf/iat clock skew, unspecified) stay in the routine-noise bucket.
        if (err.claim === 'aud' || err.claim === 'iss') {
          logger.warn(`${providerLabel} ID token failed ${err.claim} validation`, {
            claim: err.claim,
            reason: err.reason,
          });
        }
      } else if (err instanceof TokenVerificationError) {
        logger.warn(`${providerLabel} ID token was missing a required claim`);
      }
      return problem('invalid_token');
    }
    logger.error(`${providerLabel} ID token verification failed upstream`, err);
    return problem('internal');
  }
}
