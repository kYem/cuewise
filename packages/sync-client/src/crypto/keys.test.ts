import { describe, expect, it } from 'vitest';
import { DecryptError, EnvelopeParseError } from './errors';
import { deriveMasterKey, generateDataKey, unwrapDataKey, wrapDataKey } from './keys';
import { b64urlEncode, randomBytes } from './primitives';
import { generateRecoveryCode } from './recovery-code';

/** A master key derived from a freshly generated recovery code — the shared "some valid mk" fixture. */
async function freshMasterKey(): Promise<Uint8Array> {
  return deriveMasterKey((await generateRecoveryCode()).secret);
}

describe('key hierarchy', () => {
  it('deriveMasterKey is deterministic over the same secret', async () => {
    const { secret } = await generateRecoveryCode();
    const a = await deriveMasterKey(secret);
    const b = await deriveMasterKey(secret);
    expect(a).toHaveLength(32);
    expect(b64urlEncode(a)).toBe(b64urlEncode(b));
  });

  it('wrap/unwrap round-trips the data key and keyId', async () => {
    const mk = await freshMasterKey();
    const dk = generateDataKey();
    const blob = await wrapDataKey(mk, dk, 'dk-1');
    expect(blob).toMatch(/^v1\.dk-1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const unwrapped = await unwrapDataKey(mk, blob);
    expect(b64urlEncode(unwrapped.dk)).toBe(b64urlEncode(dk));
    expect(unwrapped.keyId).toBe('dk-1');
  });

  it('unwrap with the wrong master key throws DecryptError', async () => {
    const mk = await freshMasterKey();
    const wrongMk = await freshMasterKey();
    const blob = await wrapDataKey(mk, generateDataKey(), 'dk-1');
    await expect(unwrapDataKey(wrongMk, blob)).rejects.toThrow(DecryptError);
  });

  it('a tampered keyId in the blob fails authentication (keyId is inside the AAD-bound envelope header)', async () => {
    const mk = await freshMasterKey();
    const blob = await wrapDataKey(mk, generateDataKey(), 'dk-1');
    const tampered = blob.replace('.dk-1.', '.dk-2.');
    await expect(unwrapDataKey(mk, tampered)).rejects.toThrow(DecryptError);
  });

  it('rejects malformed blobs with EnvelopeParseError', async () => {
    const mk = await freshMasterKey();
    await expect(unwrapDataKey(mk, 'v1.dk-1.onlythree')).rejects.toThrow(EnvelopeParseError);
    await expect(unwrapDataKey(mk, 'v2.dk-1.aaaa.bbbb')).rejects.toThrow(EnvelopeParseError);
    await expect(unwrapDataKey(mk, 'v1.wat.aaaa.bbbb')).rejects.toThrow(EnvelopeParseError);
  });

  it('rejects a wrapped-key blob whose ciphertext is shorter than the minimum GCM tag with EnvelopeParseError, not DecryptError', async () => {
    const mk = await freshMasterKey();
    const iv = b64urlEncode(randomBytes(12));
    const shortCt = b64urlEncode(randomBytes(8));
    await expect(unwrapDataKey(mk, `v1.dk-1.${iv}.${shortCt}`)).rejects.toThrow(EnvelopeParseError);
  });
});
