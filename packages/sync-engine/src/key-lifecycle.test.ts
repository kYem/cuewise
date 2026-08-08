import {
  DecryptError,
  deriveMasterKey,
  generateDataKey,
  generateRecoveryCode,
  wrapDataKey,
} from '@cuewise/crypto';
import { logger } from '@cuewise/shared';
import { describe, expect, it, vi } from 'vitest';
import { FakeKeyTransport } from './__fixtures__/fake-key-transport';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import {
  checkForLostDataKey,
  initOrEnrollKey,
  RecoveryCodeRequiredError,
  SelfHealNeedsEnrollError,
  SYNC_DATA_KEY,
} from './key-lifecycle';

describe('initOrEnrollKey', () => {
  it('brand-new account generates a key, PUTs it create-only, and shows the recovery code once', async () => {
    const transport = new FakeKeyTransport();
    const keyStore = new FakeKvStore();

    const result = await initOrEnrollKey({ transport, keyStore });

    expect(result.keyId).toBe('dk-1');
    expect(result.recoveryCodeToShow).toBeDefined();
    expect(transport.putCalls).toEqual([{ envelope: transport.envelope, ifAbsent: true }]);
    const persisted = await keyStore.get(SYNC_DATA_KEY, 'local');
    expect(persisted).not.toBeNull();
  });

  it('a second device on the same transport enrolls with the shown code and derives the same dk bytes', async () => {
    const transport = new FakeKeyTransport();
    const deviceA = await initOrEnrollKey({ transport, keyStore: new FakeKvStore() });

    const deviceB = await initOrEnrollKey(
      { transport, keyStore: new FakeKvStore() },
      deviceA.recoveryCodeToShow
    );

    expect(deviceB.dk).toEqual(deviceA.dk);
    expect(deviceB.keyId).toBe(deviceA.keyId);
    expect(deviceB.recoveryCodeToShow).toBeUndefined();
  });

  it('enrolling against an existing envelope with a wrong-but-valid code throws DecryptError', async () => {
    const transport = new FakeKeyTransport();
    await initOrEnrollKey({ transport, keyStore: new FakeKvStore() });
    const { code: wrongCode } = await generateRecoveryCode();

    await expect(
      initOrEnrollKey({ transport, keyStore: new FakeKvStore() }, wrongCode)
    ).rejects.toThrow(DecryptError);
  });

  it('enrolling against an existing envelope with no code throws a clear error', async () => {
    const transport = new FakeKeyTransport();
    await initOrEnrollKey({ transport, keyStore: new FakeKvStore() });

    await expect(initOrEnrollKey({ transport, keyStore: new FakeKvStore() })).rejects.toThrow(
      RecoveryCodeRequiredError
    );
  });

  it('falls through to enroll when the create-only PUT loses the race, unwrapping the winner’s dk', async () => {
    const transport = new FakeKeyTransport();
    const winnerDk = generateDataKey();
    const { code: winnerCode, secret } = await generateRecoveryCode();
    const mk = await deriveMasterKey(secret);
    transport.raceWinnerEnvelope = await wrapDataKey(mk, winnerDk, 'dk-1');

    const result = await initOrEnrollKey({ transport, keyStore: new FakeKvStore() }, winnerCode);

    expect(result.dk).toEqual(winnerDk);
    expect(result.recoveryCodeToShow).toBeUndefined();
    expect(transport.putCalls).toEqual([{ envelope: expect.any(String), ifAbsent: true }]);
  });

  it('reports a recovery code it had to discard, since the account had no envelope', async () => {
    const transport = new FakeKeyTransport();
    const { code } = await generateRecoveryCode();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await initOrEnrollKey({ transport, keyStore: new FakeKvStore() }, code);

    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync ignored a recovery code: this account had no envelope to restore'
    );
  });

  it('stays quiet when a lost race honours the code instead of discarding it', async () => {
    // The log must sit after the create-only PUT wins: on the race it loses, the code IS used.
    const transport = new FakeKeyTransport();
    const winnerDk = generateDataKey();
    const { code: winnerCode, secret } = await generateRecoveryCode();
    const mk = await deriveMasterKey(secret);
    transport.raceWinnerEnvelope = await wrapDataKey(mk, winnerDk, 'dk-1');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await initOrEnrollKey({ transport, keyStore: new FakeKvStore() }, winnerCode);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('falls through to enroll on a lost race but throws a clear error when no code is given', async () => {
    const transport = new FakeKeyTransport();
    const winnerDk = generateDataKey();
    const { secret } = await generateRecoveryCode();
    const mk = await deriveMasterKey(secret);
    transport.raceWinnerEnvelope = await wrapDataKey(mk, winnerDk, 'dk-1');

    await expect(initOrEnrollKey({ transport, keyStore: new FakeKvStore() })).rejects.toThrow(
      RecoveryCodeRequiredError
    );
  });

  it('resumes from a persisted data key without fetching the envelope or needing a code', async () => {
    const transport = new FakeKeyTransport();
    const keyStore = new FakeKvStore();
    const first = await initOrEnrollKey({ transport, keyStore });

    const getEnvSpy = vi.spyOn(transport, 'getRecoveryEnvelope');
    const again = await initOrEnrollKey({ transport, keyStore });

    expect(again.dk).toEqual(first.dk);
    expect(getEnvSpy).not.toHaveBeenCalled();
    expect(again.recoveryCodeToShow).toBeUndefined();
  });
});

describe('checkForLostDataKey', () => {
  it('does not ask the server anything while the local dk is present', async () => {
    // ENG-98: with the key on disk the device syncs either way, so the envelope is the settings
    // panel's business (SyncEngine.refreshRecoveryEnvelope) and not a per-start network hop.
    const transport = new FakeKeyTransport();
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport, keyStore });
    const getEnvSpy = vi.spyOn(transport, 'getRecoveryEnvelope');

    await expect(checkForLostDataKey({ transport, keyStore })).resolves.toBeUndefined();

    expect(getEnvSpy).not.toHaveBeenCalled();
    expect(transport.putCalls).toHaveLength(1); // no re-upload attempted
  });

  it('throws a needs-enroll signal when the local dk is missing but the server has a blob', async () => {
    const transport = new FakeKeyTransport();
    await initOrEnrollKey({ transport, keyStore: new FakeKvStore() });
    const freshKeyStore = new FakeKvStore(); // simulates a device with no local dk

    await expect(checkForLostDataKey({ transport, keyStore: freshKeyStore })).rejects.toThrow(
      SelfHealNeedsEnrollError
    );
  });

  it('no-ops when neither the local dk nor the server envelope exist', async () => {
    await expect(
      checkForLostDataKey({ transport: new FakeKeyTransport(), keyStore: new FakeKvStore() })
    ).resolves.toBeUndefined();
  });
});
