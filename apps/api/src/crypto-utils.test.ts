import { afterEach, describe, expect, it, vi } from 'vitest';
import { spyOnLoggerWarn } from './__fixtures__/logger.fixtures';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('rejects a state whose body was tampered with after signing, and warns', async () => {
    const warnSpy = spyOnLoggerWarn();
    const state = await signState({ nonce: 'n-1' }, KEY);
    const [body, sig] = state.split('.');

    const tampered = `${flipLastChar(body)}.${sig}`;

    expect(await verifyState(tampered, KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('verifyState: HMAC signature verification failed');
  });

  it('rejects a state verified with the wrong key, and warns', async () => {
    const warnSpy = spyOnLoggerWarn();
    const state = await signState({ nonce: 'n-1' }, KEY);

    expect(await verifyState(state, 'a-different-signing-key')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('verifyState: HMAC signature verification failed');
  });

  it('rejects a state with no signature separator, and warns (the actual forged-state shape)', async () => {
    const warnSpy = spyOnLoggerWarn();

    expect(await verifyState('not-a-signed-state', KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('verifyState: state is not signed');
  });

  it('rejects a state whose signature cannot be base64url-decoded, and warns', async () => {
    const warnSpy = spyOnLoggerWarn();
    const state = await signState({ nonce: 'n-1' }, KEY);
    const [body] = state.split('.');
    const malformed = `${body}.!!!not-base64url!!!`;

    expect(await verifyState(malformed, KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('verifyState: state could not be decoded');
  });
});
