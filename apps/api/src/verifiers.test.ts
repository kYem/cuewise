import { env } from 'cloudflare:test';
import {
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose';
import { describe, expect, it } from 'vitest';
import { spyOnLoggerError, spyOnLoggerWarn } from './__fixtures__/logger.fixtures';
import {
  ConfigError,
  createIdTokenVerifier,
  isTokenFault,
  parseClientIds,
  TokenVerificationError,
  verifyOrProblem,
} from './verifiers';

// resolveAudience runs before jwtVerify, so an empty audience throws without ever touching the key.
const unusedJwks: JWTVerifyGetKey = async () => {
  throw new Error('jwks should not be consulted when the audience is empty');
};

describe('parseClientIds', () => {
  it('splits on comma and trims whitespace around each entry', () => {
    expect(parseClientIds('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseClientIds('')).toEqual([]);
  });
});

describe('isTokenFault', () => {
  // Every class isTokenFault treats as a provably-bad token — a regression dropping any one
  // of these (e.g. JWTExpired) would turn a routine expired-token rejection into a retryable 500.
  const tokenFaultCases: Array<[string, unknown]> = [
    ['JWTExpired', new errors.JWTExpired('token expired', {})],
    ['JWTClaimValidationFailed', new errors.JWTClaimValidationFailed('bad claim', {})],
    ['JWTInvalid', new errors.JWTInvalid('malformed jwt')],
    ['JWSInvalid', new errors.JWSInvalid('malformed jws')],
    ['JWSSignatureVerificationFailed', new errors.JWSSignatureVerificationFailed()],
    ['JOSEAlgNotAllowed', new errors.JOSEAlgNotAllowed('alg not allowed')],
    ['JOSENotSupported', new errors.JOSENotSupported('alg not supported')],
    ['JWKSNoMatchingKey', new errors.JWKSNoMatchingKey()],
    ['TokenVerificationError', new TokenVerificationError('missing sub')],
  ];

  for (const [name, err] of tokenFaultCases) {
    it(`treats ${name} as a token fault`, () => {
      expect(isTokenFault(err)).toBe(true);
    });
  }

  const upstreamFailureCases: Array<[string, unknown]> = [
    ['JWKSTimeout', new errors.JWKSTimeout()],
    ['a generic JOSEError', new errors.JOSEError('unexpected upstream failure')],
    ['a plain Error', new Error('boom')],
  ];

  for (const [name, err] of upstreamFailureCases) {
    it(`does not treat ${name} as a token fault`, () => {
      expect(isTokenFault(err)).toBe(false);
    });
  }
});

describe('createIdTokenVerifier audience fail-closed', () => {
  // The Apple bug this guards: an empty string is falsy, so jose would skip the aud check
  // entirely (fail-open). The verifier must reject an empty audience before jwtVerify runs.
  const emptyAudienceCases: Array<[string, () => string | string[]]> = [
    ['an empty string (Apple shape)', () => ''],
    ['an empty array (Google shape)', () => []],
    ['an array of only empty strings', () => ['', '']],
  ];

  for (const [name, audience] of emptyAudienceCases) {
    it(`throws ConfigError for ${name}`, async () => {
      const verifier = createIdTokenVerifier({
        jwks: unusedJwks,
        issuer: 'https://issuer.example',
        audience,
        label: 'Apple',
      });

      await expect(verifier('any.id.token', env)).rejects.toBeInstanceOf(ConfigError);
    });
  }

  it('does not throw ConfigError when at least one client id is configured', async () => {
    const verifier = createIdTokenVerifier({
      jwks: unusedJwks,
      issuer: 'https://issuer.example',
      audience: () => ['configured-client'],
      label: 'Google',
    });

    // jwtVerify still runs (and rejects via the stub jwks), but not with a ConfigError.
    await expect(verifier('any.id.token', env)).rejects.not.toBeInstanceOf(ConfigError);
  });
});

describe('createIdTokenVerifier algorithm pin', () => {
  it('rejects a non-RS256 token even when the JWKS holds its matching key', async () => {
    // The ES256 key IS resolvable here, so only the algorithms:['RS256'] pin can reject it —
    // isolating the pin from jose's key-type check.
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'ES256' }] });
    const verifier = createIdTokenVerifier({
      jwks,
      issuer: 'https://issuer.example',
      audience: () => 'client-1',
      label: 'Test',
    });
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer('https://issuer.example')
      .setAudience('client-1')
      .setSubject('sub-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifier(token, env)).rejects.toBeInstanceOf(errors.JOSEAlgNotAllowed);
  });
});

describe('verifyOrProblem config-fault handling', () => {
  it('answers 500 internal and logs an error when the verifier throws ConfigError', async () => {
    const errorSpy = spyOnLoggerError();
    const verifier = async () => {
      throw new ConfigError('Apple audience is not configured');
    };

    const res = await verifyOrProblem(verifier, 'whatever', env, 'Apple');

    if (!(res instanceof Response)) {
      throw new Error('expected verifyOrProblem to return a Response');
    }
    expect(res.status).toBe(500);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('internal');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('verifyOrProblem token-fault logging', () => {
  function throwingVerifier(err: unknown) {
    return async () => {
      throw err;
    };
  }

  async function expectInvalidToken(err: unknown): Promise<void> {
    const res = await verifyOrProblem(throwingVerifier(err), 'whatever', env, 'Google');
    if (!(res instanceof Response)) {
      throw new Error('expected verifyOrProblem to return a Response');
    }
    expect(res.status).toBe(401);
  }

  // Every probing-shaped fault (structurally bad token, bad signature, bad key) is worth a
  // warn; only the two routine ones below (clock skew, stale clients) should stay silent.
  const probingCases: Array<[string, unknown]> = [
    ['TokenVerificationError', new TokenVerificationError('missing sub')],
    ['JWTInvalid', new errors.JWTInvalid('malformed jwt')],
    ['JWSInvalid', new errors.JWSInvalid('malformed jws')],
    ['JWSSignatureVerificationFailed', new errors.JWSSignatureVerificationFailed()],
    ['JOSEAlgNotAllowed', new errors.JOSEAlgNotAllowed('alg not allowed')],
    ['JOSENotSupported', new errors.JOSENotSupported('alg not supported')],
    ['JWKSNoMatchingKey', new errors.JWKSNoMatchingKey()],
  ];

  for (const [name, err] of probingCases) {
    it(`warns on ${name}`, async () => {
      const warnSpy = spyOnLoggerWarn();

      await expectInvalidToken(err);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  }

  const routineCases: Array<[string, unknown]> = [
    ['JWTExpired', new errors.JWTExpired('token expired', {})],
    // A JWTClaimValidationFailed with no claim tag stays routine; only aud/iss surface a warn.
    [
      'JWTClaimValidationFailed (unspecified claim)',
      new errors.JWTClaimValidationFailed('bad claim', {}),
    ],
  ];

  for (const [name, err] of routineCases) {
    it(`stays silent on ${name}`, async () => {
      const warnSpy = spyOnLoggerWarn();

      await expectInvalidToken(err);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  }

  // An aud/iss mismatch is an integration bug or audience-confusion probe — the two claim
  // failures that must be visible, unlike the routine nbf/iat clock-skew ones above.
  const surfacedClaimCases: Array<[string, 'aud' | 'iss']> = [
    ['aud', 'aud'],
    ['iss', 'iss'],
  ];

  for (const [name, claim] of surfacedClaimCases) {
    it(`warns on a JWTClaimValidationFailed for the ${name} claim`, async () => {
      const warnSpy = spyOnLoggerWarn();
      const err = new errors.JWTClaimValidationFailed(
        `unexpected "${claim}" claim value`,
        {},
        claim
      );

      await expectInvalidToken(err);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  }
});
