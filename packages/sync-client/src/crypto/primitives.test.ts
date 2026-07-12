import { describe, expect, it } from 'vitest';
import { DecryptError, EnvelopeParseError } from './errors';
import {
  aesGcmOpen,
  aesGcmSeal,
  b64urlDecode,
  b64urlEncode,
  hkdfSha256,
  randomBytes,
  sha256,
  utf8,
} from './primitives';

describe('primitives', () => {
  it('randomBytes returns the requested length and differs between calls', () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    expect(a).toHaveLength(32);
    expect(b64urlEncode(a)).not.toBe(b64urlEncode(b));
  });

  it('sha256 matches a known vector', async () => {
    // sha256("abc") — FIPS 180-2 test vector
    const digest = await sha256(utf8('abc'));
    expect(b64urlEncode(digest)).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });

  it('hkdfSha256 is deterministic and length-exact', async () => {
    const ikm = utf8('test-input-key-material');
    const a = await hkdfSha256(ikm, 'cuewise-mk-v1', 256);
    const b = await hkdfSha256(ikm, 'cuewise-mk-v1', 256);
    expect(a).toHaveLength(32);
    expect(b64urlEncode(a)).toBe(b64urlEncode(b));
  });

  it('hkdfSha256 output changes with info', async () => {
    const ikm = utf8('test-input-key-material');
    const a = await hkdfSha256(ikm, 'cuewise-mk-v1', 256);
    const b = await hkdfSha256(ikm, 'other-info', 256);
    expect(b64urlEncode(a)).not.toBe(b64urlEncode(b));
  });

  it('aesGcm seal/open round-trips with AAD', async () => {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const sealed = await aesGcmSeal(key, iv, utf8('hello'), utf8('v1|goals|g1'));
    const opened = await aesGcmOpen(key, iv, sealed, utf8('v1|goals|g1'));
    expect(new TextDecoder().decode(opened)).toBe('hello');
  });

  it('aesGcmOpen throws DecryptError on wrong key', async () => {
    const iv = randomBytes(12);
    const sealed = await aesGcmSeal(randomBytes(32), iv, utf8('hello'), utf8('aad'));
    await expect(aesGcmOpen(randomBytes(32), iv, sealed, utf8('aad'))).rejects.toThrow(
      DecryptError
    );
  });

  it('aesGcmOpen throws DecryptError on AAD mismatch', async () => {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const sealed = await aesGcmSeal(key, iv, utf8('hello'), utf8('v1|goals|g1'));
    await expect(aesGcmOpen(key, iv, sealed, utf8('v1|goals|g2'))).rejects.toThrow(DecryptError);
  });

  it('aesGcmOpen throws DecryptError on flipped ciphertext bit', async () => {
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const sealed = await aesGcmSeal(key, iv, utf8('hello'), utf8('aad'));
    sealed[0] ^= 0x01;
    await expect(aesGcmOpen(key, iv, sealed, utf8('aad'))).rejects.toThrow(DecryptError);
  });

  it('b64url round-trips and rejects invalid input', () => {
    const bytes = randomBytes(33);
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes);
    expect(b64urlEncode(bytes)).not.toMatch(/[+/=]/);
    expect(() => b64urlDecode('not!!valid')).toThrow(EnvelopeParseError);
  });
});
