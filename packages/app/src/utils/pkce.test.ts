import { describe, expect, it } from 'vitest';
import { computeCodeChallenge, generateCodeVerifier } from './pkce';

// The server's CODE_CHALLENGE_RE and RFC 7636 §4.1's unreserved set both accept exactly this.
const BASE64URL_43_RE = /^[A-Za-z0-9_-]{43}$/;

describe('generateCodeVerifier', () => {
  it('produces 43 base64url characters (32 bytes, unpadded)', () => {
    expect(generateCodeVerifier()).toMatch(BASE64URL_43_RE);
  });

  it('produces a different verifier on every call', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe('computeCodeChallenge', () => {
  it('is the unpadded base64url SHA-256 of the verifier', async () => {
    // Independently computed (node:crypto) so the assertion doesn't share the implementation.
    const { createHash } = await import('node:crypto');
    const verifier = 'a'.repeat(43);
    const expected = createHash('sha256').update(verifier).digest('base64url');

    await expect(computeCodeChallenge(verifier)).resolves.toBe(expected);
  });

  it('produces a 43-char base64url challenge the server-side S256 check accepts', async () => {
    await expect(computeCodeChallenge(generateCodeVerifier())).resolves.toMatch(BASE64URL_43_RE);
  });
});
