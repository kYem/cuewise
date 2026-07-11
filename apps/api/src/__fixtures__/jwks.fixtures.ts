import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import type { Env } from '../env';
import type { IdTokenVerifier, VerifiedIdentity } from '../verifiers';
import { isEmailVerified, parseClientIds, TokenVerificationError } from '../verifiers';

export interface TestIdp {
  sign(claims: {
    iss: string;
    aud: string;
    sub: string;
    email?: string;
    // Omit to mimic a token with no email_verified claim at all.
    emailVerified?: boolean | string;
    nonce?: string;
  }): Promise<string>;
  verifier(expected: {
    issuer: string;
    // Defaults to GOOGLE_CLIENT_IDS; pass to verify against a different audience (e.g. Apple).
    audience?: (env: Env) => string | string[];
  }): IdTokenVerifier;
}

export async function createTestIdp(): Promise<TestIdp> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'RS256' }] });
  return {
    async sign(claims) {
      return new SignJWT({
        email: claims.email,
        email_verified: claims.emailVerified,
        nonce: claims.nonce,
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(claims.iss)
        .setAudience(claims.aud)
        .setSubject(claims.sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    },
    verifier(expected) {
      const resolveAudience =
        expected.audience ?? ((env: Env) => parseClientIds(env.GOOGLE_CLIENT_IDS));
      return async (idToken: string, env: Env): Promise<VerifiedIdentity> => {
        const { payload } = await jwtVerify(idToken, jwks, {
          issuer: expected.issuer,
          audience: resolveAudience(env),
        });
        if (typeof payload.sub !== 'string') {
          throw new TokenVerificationError('missing sub');
        }
        return {
          providerSub: payload.sub,
          email:
            typeof payload.email === 'string' && isEmailVerified(payload)
              ? payload.email
              : undefined,
          nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
        };
      };
    },
  };
}
