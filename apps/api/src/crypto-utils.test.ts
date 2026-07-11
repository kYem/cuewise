import { describe, expect, it } from 'vitest';
import {
  base64UrlDecodeString,
  base64UrlEncodeString,
  signState,
  verifyState,
} from './crypto-utils';

describe('base64UrlEncodeString / base64UrlDecodeString', () => {
  it('round-trips a state payload with a non-ASCII returnUri byte-exactly', () => {
    const state = { returnUri: 'cuewise://auth?name=héllo 世界 🎉', codeChallenge: 'a'.repeat(43) };
    const json = JSON.stringify(state);

    const decoded = base64UrlDecodeString(base64UrlEncodeString(json));

    expect(decoded).toBe(json);
    expect(JSON.parse(decoded)).toEqual(state);
  });
});

describe('signState / verifyState', () => {
  const KEY = 'unit-test-signing-key';

  /** Replaces the last character with a different, still-valid base64url character. */
  function flipLastChar(value: string): string {
    const replacement = value.at(-1) === 'A' ? 'B' : 'A';
    return `${value.slice(0, -1)}${replacement}`;
  }

  it('round-trips a payload through sign and verify', async () => {
    const payload = { returnUri: 'cuewise://auth', codeChallenge: 'a'.repeat(43), nonce: 'n-1' };

    const state = await signState(payload, KEY);

    expect(await verifyState(state, KEY)).toEqual(payload);
  });

  it('rejects a state whose body was tampered with after signing', async () => {
    const state = await signState({ nonce: 'n-1' }, KEY);
    const [body, sig] = state.split('.');

    const tampered = `${flipLastChar(body)}.${sig}`;

    expect(await verifyState(tampered, KEY)).toBeNull();
  });

  it('rejects a state verified with the wrong key', async () => {
    const state = await signState({ nonce: 'n-1' }, KEY);

    expect(await verifyState(state, 'a-different-signing-key')).toBeNull();
  });

  it('rejects a state with no signature separator', async () => {
    expect(await verifyState('not-a-signed-state', KEY)).toBeNull();
  });
});
