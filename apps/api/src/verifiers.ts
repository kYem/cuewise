import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env';

export interface VerifiedIdentity {
  providerSub: string;
  email?: string;
}

export type IdTokenVerifier = (idToken: string, env: Env) => Promise<VerifiedIdentity>;

/** A verified-but-rejected token (e.g. missing claim); distinct from an upstream/network failure. */
export class TokenVerificationError extends Error {}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export const verifyGoogleIdToken: IdTokenVerifier = async (idToken, env) => {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_IDS.split(','),
  });
  if (typeof payload.sub !== 'string') {
    throw new TokenVerificationError('Google ID token missing sub');
  }
  return {
    providerSub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
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
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
};
