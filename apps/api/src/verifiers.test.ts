import { env } from 'cloudflare:test';
import { errors } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spyOnLoggerWarn } from './__fixtures__/logger.fixtures';
import { isTokenFault, parseClientIds, TokenVerificationError, verifyOrProblem } from './verifiers';

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

describe('verifyOrProblem token-fault logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    ['JWTClaimValidationFailed', new errors.JWTClaimValidationFailed('bad claim', {})],
  ];

  for (const [name, err] of routineCases) {
    it(`stays silent on ${name}`, async () => {
      const warnSpy = spyOnLoggerWarn();

      await expectInvalidToken(err);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  }
});
