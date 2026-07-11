import { describe, expect, it } from 'vitest';
import { base64UrlDecodeString, base64UrlEncodeString } from './crypto-utils';

describe('base64UrlEncodeString / base64UrlDecodeString', () => {
  it('round-trips a state payload with a non-ASCII returnUri byte-exactly', () => {
    const state = { returnUri: 'cuewise://auth?name=héllo 世界 🎉', codeChallenge: 'a'.repeat(43) };
    const json = JSON.stringify(state);

    const decoded = base64UrlDecodeString(base64UrlEncodeString(json));

    expect(decoded).toBe(json);
    expect(JSON.parse(decoded)).toEqual(state);
  });
});
