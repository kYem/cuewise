import { createRemoteJWKSet, errors, type JWTPayload, jwtVerify } from 'jose';
import type { Env } from './env';

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

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const verifyGoogleIdToken: IdTokenVerifier = async (idToken, env) => {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_IDS.split(',').map((id) => id.trim()),
  });
  if (typeof payload.sub !== 'string') {
    throw new TokenVerificationError('Google ID token missing sub');
  }
  return {
    providerSub: payload.sub,
    email:
      typeof payload.email === 'string' && isEmailVerified(payload) ? payload.email : undefined,
  };
};

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export const verifyAppleIdToken: IdTokenVerifier = async (idToken, env) => {
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: env.APPLE_CLIENT_ID,
  });
  if (typeof payload.sub !== 'string') {
    throw new TokenVerificationError('Apple ID token missing sub');
  }
  return {
    providerSub: payload.sub,
    email:
      typeof payload.email === 'string' && isEmailVerified(payload) ? payload.email : undefined,
  };
};
