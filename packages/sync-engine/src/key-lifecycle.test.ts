import {
  DecryptError,
  deriveMasterKey,
  generateDataKey,
  generateRecoveryCode,
  wrapDataKey,
} from '@cuewise/crypto';
import { logger } from '@cuewise/shared';
import { describe, expect, it, vi } from 'vitest';
import { FakeKeyTransport, signIn } from './__fixtures__/fake-key-transport';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { unbindPersistedDataKey } from './__fixtures__/legacy-data-key';
import { sealedGoal } from './__fixtures__/records';
import {
  bindLegacyDataKey,
  checkForLostDataKey,
  initOrEnrollKey,
  loadPersistedDataKey,
  markEnableCompleted,
  RecoveryCodeRequiredError,
  type ResolvedDataKey,
  SelfHealNeedsEnrollError,
  SYNC_DATA_KEY,
  SYNC_PARKED_DATA_KEYS,
  SYNC_UNBOUND_DATA_KEY,
  setAsideDataKey,
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

  it('binds a newly minted key to the signed-in account', async () => {
    const keyStore = new FakeKvStore();

    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });

    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
  });
});

/** Account B, already holding a key minted on another device; answers that device's code. */
async function enrolledElsewhere(): Promise<{
  accountB: FakeKeyTransport;
  owner: ResolvedDataKey;
  code: string;
}> {
  const accountB = new FakeKeyTransport('user-b');
  const owner = await initOrEnrollKey({ transport: accountB, keyStore: new FakeKvStore() });
  if (owner.recoveryCodeToShow === undefined) {
    throw new Error('expected account B to mint a recovery code');
  }
  return { accountB, owner, code: owner.recoveryCodeToShow };
}

describe('signing in again', () => {
  it('restores the same account’s key without a code', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    const first = await initOrEnrollKey({ transport: accountA, keyStore });

    const again = await signIn(accountA, keyStore);

    expect(again.dk).toEqual(first.dk);
    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
  });

  it('reports no finished enable for a key that was never marked', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    await initOrEnrollKey({ transport: accountA, keyStore });

    expect((await signIn(accountA, keyStore)).enableCompleted).toBe(false);
  });

  it('reports a finished enable once one was marked for that account', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    await initOrEnrollKey({ transport: accountA, keyStore });
    await markEnableCompleted(keyStore);

    expect((await signIn(accountA, keyStore)).enableCompleted).toBe(true);
  });

  it('parks a foreign active key even when nothing set it aside first', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    const { accountB } = await enrolledElsewhere();

    await expect(initOrEnrollKey({ transport: accountB, keyStore })).rejects.toThrow(
      RecoveryCodeRequiredError
    );

    expect(await keyStore.get(SYNC_PARKED_DATA_KEYS, 'local')).toHaveProperty('user-a');
  });

  it('does not reuse another account’s key, and asks for this one’s code instead', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    const { accountB } = await enrolledElsewhere();

    await expect(signIn(accountB, keyStore)).rejects.toThrow(RecoveryCodeRequiredError);

    expect(await loadPersistedDataKey(keyStore)).toBeNull();
    expect(await keyStore.get(SYNC_PARKED_DATA_KEYS, 'local')).toHaveProperty('user-a');
  });

  it('honours a recovery code even though another account’s key was active', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    const { accountB, owner, code } = await enrolledElsewhere();

    const switched = await signIn(accountB, keyStore, code);

    expect(switched.dk).toEqual(owner.dk);
    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-b' });
  });

  it('restores an account’s key without a code when the device switches back to it', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    const first = await initOrEnrollKey({ transport: accountA, keyStore });
    await signIn(new FakeKeyTransport('user-b'), keyStore);

    const back = await signIn(accountA, keyStore);

    expect(back.dk).toEqual(first.dk);
    expect(back.recoveryCodeToShow).toBeUndefined();
  });

  it('keeps the account’s key parked when the account cannot be identified', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    const first = await initOrEnrollKey({ transport: accountA, keyStore });
    vi.spyOn(accountA, 'getAccount').mockRejectedValueOnce(new Error('offline'));

    await expect(signIn(accountA, keyStore)).rejects.toThrow('offline');

    expect(await loadPersistedDataKey(keyStore)).toBeNull();
    expect((await initOrEnrollKey({ transport: accountA, keyStore })).dk).toEqual(first.dk);
  });

  it('keeps the active key in place when the parked keys cannot be read', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    keyStore.failGetManyForKey = SYNC_PARKED_DATA_KEYS;

    await expect(setAsideDataKey(keyStore)).rejects.toThrow(
      `could not read ${SYNC_PARKED_DATA_KEYS}`
    );

    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
  });

  it('drops an unreadable parked slot rather than blocking every sign-in', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    keyStore.unreadableKey = SYNC_PARKED_DATA_KEYS;
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await setAsideDataKey(keyStore);

    keyStore.unreadableKey = null;
    expect(await keyStore.get(SYNC_PARKED_DATA_KEYS, 'local')).toHaveProperty('user-a');
    expect(errorSpy).toHaveBeenCalledWith(
      `Cloud sync dropped ${SYNC_PARKED_DATA_KEYS}: it is stored but unreadable`
    );
  });

  it('keeps the active key in place when it cannot be parked', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    keyStore.failSetsForKey = SYNC_PARKED_DATA_KEYS;

    await expect(setAsideDataKey(keyStore)).rejects.toThrow(
      `failed to write ${SYNC_PARKED_DATA_KEYS}`
    );

    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
  });

  it('refuses to continue when the active key cannot be removed', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    keyStore.failRemovesForKey = SYNC_DATA_KEY;

    await expect(setAsideDataKey(keyStore)).rejects.toThrow(
      'failed to set aside the sync data key'
    );
  });
});

describe('a key stored before keys recorded their account', () => {
  async function unboundKeyOf(accountA: FakeKeyTransport, keyStore: FakeKvStore) {
    const first = await initOrEnrollKey({ transport: accountA, keyStore });
    await unbindPersistedDataKey(keyStore);
    return first;
  }

  it('is kept, not reused, when no record proves it', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    await unboundKeyOf(accountA, keyStore);

    await expect(signIn(accountA, keyStore)).rejects.toThrow(RecoveryCodeRequiredError);

    expect(await keyStore.get(SYNC_UNBOUND_DATA_KEY, 'local')).not.toBeNull();
  });

  it('is bound and reused once it opens the account’s records', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    const first = await unboundKeyOf(accountA, keyStore);
    accountA.records = [await sealedGoal(first.dk, first.keyId)];

    const restored = await signIn(accountA, keyStore);

    expect(restored.dk).toEqual(first.dk);
    expect(await loadPersistedDataKey(keyStore)).toMatchObject({ userId: 'user-a' });
    expect(await keyStore.get(SYNC_UNBOUND_DATA_KEY, 'local')).toBeNull();
  });

  it('is kept when the account’s records cannot be fetched', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    await unboundKeyOf(accountA, keyStore);
    vi.spyOn(accountA, 'getChanges').mockRejectedValueOnce(new Error('offline'));

    await expect(signIn(accountA, keyStore)).rejects.toThrow('offline');

    expect(await keyStore.get(SYNC_UNBOUND_DATA_KEY, 'local')).not.toBeNull();
  });

  it('is not proven by a page it opens only in part', async () => {
    const keyStore = new FakeKvStore();
    const accountA = new FakeKeyTransport('user-a');
    const first = await unboundKeyOf(accountA, keyStore);
    const { owner } = await enrolledElsewhere();
    accountA.records = [
      await sealedGoal(first.dk, first.keyId),
      await sealedGoal(owner.dk, owner.keyId),
    ];

    await expect(signIn(accountA, keyStore)).rejects.toThrow(RecoveryCodeRequiredError);
  });

  it('is not adopted by an account whose records it cannot open', async () => {
    const keyStore = new FakeKvStore();
    await unboundKeyOf(new FakeKeyTransport('user-a'), keyStore);
    const { accountB, owner } = await enrolledElsewhere();
    accountB.records = [await sealedGoal(owner.dk, owner.keyId)];

    await expect(signIn(accountB, keyStore)).rejects.toThrow(RecoveryCodeRequiredError);
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

    await expect(checkForLostDataKey({ transport, keyStore })).resolves.toBe('present');

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

  it('restores the signed-in account’s own set-aside key', async () => {
    const transport = new FakeKeyTransport('user-a');
    const keyStore = new FakeKvStore();
    const first = await initOrEnrollKey({ transport, keyStore });
    await setAsideDataKey(keyStore);

    await checkForLostDataKey({ transport, keyStore });

    expect((await loadPersistedDataKey(keyStore))?.dk).toEqual(first.dk);
  });

  it('does not install another account’s set-aside key', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    await setAsideDataKey(keyStore);
    const { accountB } = await enrolledElsewhere();

    await expect(checkForLostDataKey({ transport: accountB, keyStore })).rejects.toThrow(
      SelfHealNeedsEnrollError
    );

    expect(await loadPersistedDataKey(keyStore)).toBeNull();
  });

  it('answers unkeyed when it holds only keys of accounts other than the signed-in one', async () => {
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport: new FakeKeyTransport('user-a'), keyStore });
    await setAsideDataKey(keyStore);

    await expect(
      checkForLostDataKey({ transport: new FakeKeyTransport('user-b'), keyStore })
    ).resolves.toBe('unkeyed');
  });

  it('does not ask whose session it is when nothing was set aside', async () => {
    const transport = new FakeKeyTransport();
    const getAccount = vi.spyOn(transport, 'getAccount');

    await checkForLostDataKey({ transport, keyStore: new FakeKvStore() });

    expect(getAccount).not.toHaveBeenCalled();
  });

  it('no-ops when neither the local dk nor the server envelope exist', async () => {
    await expect(
      checkForLostDataKey({ transport: new FakeKeyTransport(), keyStore: new FakeKvStore() })
    ).resolves.toBe('none');
  });
});
