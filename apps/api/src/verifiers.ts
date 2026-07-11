import { logger } from '@cuewise/shared';
import { createRemoteJWKSet, errors, type JWTPayload, jwtVerify } from 'jose';
import type { Env } from './env';
import { problem } from './problems';

export interface VerifiedIdentity {
  providerSub: string;
  email?: string;
}

export type IdTokenVerifier = (idToken: string, env: Env) => Promise<VerifiedIdentity>;

/** A verified-but-rejected token (e.g. missing claim); distinct from an upstream/network failure. */
export class TokenVerificationError extends Error {}

const TOKEN_FAULT_CLASSES = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
] as const;

/** True when the failure proves the presented token is bad; anything else is an upstream outage. */
export function isTokenFault(err: unknown): boolean {
  if (err instanceof TokenVerificationError) {
    return true;
  }
  // JWKSNoMatchingKey is deliberately excluded: jose suppresses JWKS refetch for 30s after a
  // load, so a token signed with a just-rotated key looks identical to a genuinely bad one.
  return TOKEN_FAULT_CLASSES.some((cls) => err instanceof cls);
}

/** Apple sends `email_verified` as the string 'true'/'false'; Google sends a boolean. */
export function isEmailVerified(payload: JWTPayload): boolean {
  return payload.email_verified === true || payload.email_verified === 'true';
}

interface IdTokenVerifierConfig {
  jwks: ReturnType<typeof createRemoteJWKSet>;
  issuer: string | string[];
  audience: (env: Env) => string | string[];
}

/** Builds a provider ID-token verifier: same claim checks, only issuer/audience differ. */
function createIdTokenVerifier(config: IdTokenVerifierConfig): IdTokenVerifier {
  return async (idToken, env) => {
    const { payload } = await jwtVerify(idToken, config.jwks, {
      issuer: config.issuer,
      audience: config.audience(env),
    });
    if (typeof payload.sub !== 'string') {
      throw new TokenVerificationError('ID token missing sub');
    }
    return {
      providerSub: payload.sub,
      email:
        typeof payload.email === 'string' && isEmailVerified(payload) ? payload.email : undefined,
    };
  };
}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const verifyGoogleIdToken = createIdTokenVerifier({
  jwks: googleJwks,
  issuer: ['https://accounts.google.com', 'accounts.google.com'],
  audience: (env) => env.GOOGLE_CLIENT_IDS.split(',').map((id) => id.trim()),
});

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export const verifyAppleIdToken = createIdTokenVerifier({
  jwks: appleJwks,
  issuer: 'https://appleid.apple.com',
  audience: (env) => env.APPLE_CLIENT_ID,
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
    // Only known token-fault classes are treated as a bad token; anything else
    // (e.g. JWKS outage) is an upstream failure — 500 so the client's retry loop engages.
    if (isTokenFault(err)) {
      return problem('invalid_token');
    }
    logger.error(`${providerLabel} ID token verification failed upstream`, err);
    return problem('internal');
  }
}
