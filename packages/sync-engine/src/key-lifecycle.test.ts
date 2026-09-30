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
import { unbindPersistedDataKey } from './__fixtures__/legacy-data-key';
import {
  bindLegacyDataKey,
  checkForLostDataKey,
  initOrEnrollKey,
  loadPersistedDataKey,
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
    expect(again.resumed).toBe(true);
  });

  it('binds a newly minted key to the signed-in account', async () => {
    const keyStore = new FakeKvStore();

    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });

    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
  });

  it('does not reuse a key persisted for another account, and asks for its code instead', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    const accountB = new FakeKeyTransport('user-b');
    await initOrEnrollKey({ transport: accountB, keyStore: new FakeKvStore() });

    await expect(initOrEnrollKey({ transport: accountB, keyStore })).rejects.toThrow(
      RecoveryCodeRequiredError
    );
    expect(await loadPersistedDataKey(keyStore)).toBeNull();
  });

  it('honours a recovery code even though another account’s key is persisted', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    const accountB = new FakeKeyTransport('user-b');
    const deviceB = await initOrEnrollKey({ transport: accountB, keyStore: new FakeKvStore() });

    const switched = await initOrEnrollKey(
      { transport: accountB, keyStore },
      deviceB.recoveryCodeToShow
    );

    expect(switched.dk).toEqual(deviceB.dk);
    expect(switched.resumed).toBe(false);
    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-b' });
  });

  it('restores an account’s key without a code when the device switches back to it', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    const first = await initOrEnrollKey({ transport: accountA, keyStore });
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-b'), keyStore });

    const back = await initOrEnrollKey({ transport: accountA, keyStore });

    expect(back.dk).toEqual(first.dk);
    expect(back.recoveryCodeToShow).toBeUndefined();
    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
  });

  it('never reuses a key persisted before keys were bound to an account', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    await initOrEnrollKey({ transport: accountA, keyStore });
    await unbindPersistedDataKey(keyStore);

    await expect(initOrEnrollKey({ transport: accountA, keyStore })).rejects.toThrow(
      RecoveryCodeRequiredError
    );
  });

  it('leaves no key in use when the account cannot be identified', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    const first = await initOrEnrollKey({ transport: accountA, keyStore });
    vi.spyOn(accountA, 'getAccount').mockRejectedValueOnce(new Error('offline'));

    await expect(initOrEnrollKey({ transport: accountA, keyStore })).rejects.toThrow('offline');

    expect(await loadPersistedDataKey(keyStore)).toBeNull();
    const retried = await initOrEnrollKey({ transport: accountA, keyStore });
    expect(retried.dk).toEqual(first.dk);
  });
});

describe('bindLegacyDataKey', () => {
  it('binds an unbound key to the given account', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    await unbindPersistedDataKey(keyStore);

    await bindLegacyDataKey(keyStore, 'user-a');

    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
  });

  it('leaves a key already bound to another account alone', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });

    await bindLegacyDataKey(keyStore, 'user-b');

    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
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
