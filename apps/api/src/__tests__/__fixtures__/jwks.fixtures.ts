import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import type { Env } from '../../env';
import type { IdTokenVerifier, VerifiedIdentity } from '../../verifiers';

export interface TestIdp {
  sign(claims: { iss: string; aud: string; sub: string; email?: string }): Promise<string>;
  verifier(expected: { issuer: string }): IdTokenVerifier;
}

export async function createTestIdp(): Promise<TestIdp> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'RS256' }] });
  return {
    async sign(claims) {
      return new SignJWT({ email: claims.email })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(claims.iss)
        .setAudience(claims.aud)
        .setSubject(claims.sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    },
    verifier(expected) {
      return async (idToken: string, env: Env): Promise<VerifiedIdentity> => {
        const { payload } = await jwtVerify(idToken, jwks, {
          issuer: expected.issuer,
          audience: env.GOOGLE_CLIENT_IDS.split(','),
        });
        if (typeof payload.sub !== 'string') {
          throw new Error('missing sub');
        }
        return {
          providerSub: payload.sub,
          email: typeof payload.email === 'string' ? payload.email : undefined,
        };
      };
    },
  };
}
