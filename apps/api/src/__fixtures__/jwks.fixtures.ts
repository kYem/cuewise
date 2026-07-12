import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { Env } from '../env';
import { createIdTokenVerifier, type IdTokenVerifier, parseClientIds } from '../verifiers';

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
      // Build through the production factory over this local JWKS, so route tests exercise the
      // real verifier (issuer/audience/sub/email/nonce handling) rather than a parallel copy.
      return createIdTokenVerifier({
        jwks,
        issuer: expected.issuer,
        audience: expected.audience ?? ((env: Env) => parseClientIds(env.GOOGLE_CLIENT_IDS)),
        label: 'TestIdp',
      });
    },
  };
}
