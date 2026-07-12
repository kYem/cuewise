import { describe, expect, it, vi } from 'vitest';
import { spyOnLoggerError, spyOnLoggerWarn } from './__fixtures__/logger.fixtures';
import {
  base64UrlDecodeString,
  base64UrlEncodeString,
  sha256Base64Url,
  signState,
  verifyState,
} from './crypto-utils';

describe('sha256Base64Url', () => {
  it('matches the RFC 7636 Appendix B S256 test vector', async () => {
    // Pins PKCE S256 to base64url-no-padding. A regression to standard base64/padding passes the
    // self-consistency tests but locks every real client out of Apple sign-in.
    const digest = await sha256Base64Url('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(digest).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

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

    expect(await verifyState(state, KEY)).toEqual({ ok: true, payload });
  });

  it('rejects a state whose body was tampered with after signing, and warns', async () => {
    const warnSpy = spyOnLoggerWarn();
    const state = await signState({ nonce: 'n-1' }, KEY);
    const [body, sig] = state.split('.');

    const tampered = `${flipLastChar(body)}.${sig}`;

    expect(await verifyState(tampered, KEY)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(warnSpy).toHaveBeenCalledWith('verifyState: HMAC signature verification failed');
  });

  it('rejects a state verified with the wrong key, and warns', async () => {
    const warnSpy = spyOnLoggerWarn();
    const state = await signState({ nonce: 'n-1' }, KEY);

    expect(await verifyState(state, 'a-different-signing-key')).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(warnSpy).toHaveBeenCalledWith('verifyState: HMAC signature verification failed');
  });

  it('rejects a state with no signature separator, and warns (the actual forged-state shape)', async () => {
    const warnSpy = spyOnLoggerWarn();

    expect(await verifyState('not-a-signed-state', KEY)).toEqual({
      ok: false,
      reason: 'unsigned',
    });
    expect(warnSpy).toHaveBeenCalledWith('verifyState: state is not signed');
  });

  it('rejects a state whose signature cannot be base64url-decoded, and warns', async () => {
    const warnSpy = spyOnLoggerWarn();
    const state = await signState({ nonce: 'n-1' }, KEY);
    const [body] = state.split('.');
    const malformed = `${body}.!!!not-base64url!!!`;

    expect(await verifyState(malformed, KEY)).toEqual({ ok: false, reason: 'undecodable' });
    expect(warnSpy).toHaveBeenCalledWith('verifyState: state could not be decoded');
  });

  it('logs an error (not a warn) and fails closed when the HMAC key import itself throws', async () => {
    const errorSpy = spyOnLoggerError();
    const warnSpy = spyOnLoggerWarn();
    const state = await signState({ nonce: 'n-1' }, KEY);
    // A fresh, never-cached key forces a real importKey call for this verifyState.
    const uncachedKey = 'signing-key-that-fails-import';
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(new Error('bad key material'));

    const result = await verifyState(state, uncachedKey);

    expect(result).toEqual({ ok: false, reason: 'key_unavailable' });
    expect(errorSpy).toHaveBeenCalledWith('verifyState: HMAC key import failed', expect.any(Error));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('pins each state to the key that signed it, even after the cache moves on', async () => {
    const payloadA = { nonce: 'n-cache-a' };
    const stateA = await signState(payloadA, KEY);

    const otherKey = 'a-second-signing-key';
    const payloadB = { nonce: 'n-cache-b' };
    const stateB = await signState(payloadB, otherKey);

    // Each state must verify under its OWN key...
    expect(await verifyState(stateA, KEY)).toEqual({ ok: true, payload: payloadA });
    expect(await verifyState(stateB, otherKey)).toEqual({ ok: true, payload: payloadB });
    // ...and cross-verifying with the other key must fail. A cache that serves a stale
    // key would make signing/verifying self-consistently wrong and this would pass anyway.
    expect(await verifyState(stateA, otherKey)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('retries the HMAC import after a transient failure instead of caching the rejection', async () => {
    const errorSpy = spyOnLoggerError();
    const retryKey = 'retry-after-transient-import-failure';
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(
      new Error('transient WebCrypto fault')
    );

    // Any dot-shaped string reaches importHmacKey; the body/signature don't need to be real yet.
    const firstAttempt = await verifyState('irrelevant-body.irrelevant-signature', retryKey);
    expect(firstAttempt).toEqual({ ok: false, reason: 'key_unavailable' });
    expect(errorSpy).toHaveBeenCalledWith('verifyState: HMAC key import failed', expect.any(Error));

    const payload = { nonce: 'n-retry' };
    const secondState = await signState(payload, retryKey);
    expect(await verifyState(secondState, retryKey)).toEqual({ ok: true, payload });
  });

  it('imports the HMAC key once and reuses it across repeated calls with the same key', async () => {
    const importSpy = vi.spyOn(crypto.subtle, 'importKey');
    const cacheKey = 'key-for-import-cache-proof';

    const stateA = await signState({ nonce: 'n-cache-proof-a' }, cacheKey);
    const stateB = await signState({ nonce: 'n-cache-proof-b' }, cacheKey);
    await verifyState(stateA, cacheKey);
    await verifyState(stateB, cacheKey);

    expect(importSpy).toHaveBeenCalledTimes(1);
  });
});
