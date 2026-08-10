import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode } from './base64url';
import { EnvelopeParseError } from './errors';
import { randomBytes } from './primitives';

describe('base64url', () => {
  it('b64url round-trips and rejects invalid input', () => {
    const bytes = randomBytes(33);
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes);
    expect(b64urlEncode(bytes)).not.toMatch(/[+/=]/);
    expect(() => b64urlDecode('not!!valid')).toThrow(EnvelopeParseError);
  });

  it('b64urlDecode carries the atob failure as .cause on valid-alphabet, invalid-length input', () => {
    // 'A' passes the alphabet check but pads to a length atob rejects.
    expect(() => b64urlDecode('A')).toThrowError(
      expect.objectContaining({ cause: expect.anything() })
    );
  });

  it.each([
    32767, 32768, 32769, 65536,
  ])('b64urlEncode round-trips and matches Buffer.from(bytes).toString("base64url") at length %i (CHUNK_SIZE=0x8000 boundary)', (length) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = i % 251;
    }
    const encoded = b64urlEncode(bytes);
    expect(encoded).toBe(Buffer.from(bytes).toString('base64url'));
    expect(b64urlDecode(encoded)).toEqual(bytes);
  });
});
