import {
  DecryptError,
  deriveMasterKey,
  generateDataKey,
  generateRecoveryCode,
  wrapDataKey,
} from '@cuewise/crypto';
import { describe, expect, it, vi } from 'vitest';
import { FakeKeyTransport } from './__fixtures__/fake-key-transport';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import {
  initOrEnrollKey,
  RecoveryCodeRequiredError,
  SelfHealNeedsEnrollError,
  SelfHealUnrecoverableError,
  SYNC_DATA_KEY,
  selfHealKeyBlob,
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

describe('selfHealKeyBlob', () => {
  it('no-ops when both the local dk and the server envelope are present', async () => {
    const transport = new FakeKeyTransport();
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport, keyStore });

    await expect(selfHealKeyBlob({ transport, keyStore })).resolves.toBeUndefined();
    expect(transport.putCalls).toHaveLength(1); // no re-upload attempted
  });

  it('throws a needs-enroll signal when the local dk is missing but the server has a blob', async () => {
    const transport = new FakeKeyTransport();
    await initOrEnrollKey({ transport, keyStore: new FakeKvStore() });
    const freshKeyStore = new FakeKvStore(); // simulates a device with no local dk

    await expect(selfHealKeyBlob({ transport, keyStore: freshKeyStore })).rejects.toThrow(
      SelfHealNeedsEnrollError
    );
  });

  it('throws an unrecoverable signal when the local dk is present but the server blob is missing', async () => {
    const transport = new FakeKeyTransport();
    const keyStore = new FakeKvStore();
    await initOrEnrollKey({ transport, keyStore });
    transport.envelope = null; // simulates the server having lost/never received the blob

    await expect(selfHealKeyBlob({ transport, keyStore })).rejects.toThrow(
      SelfHealUnrecoverableError
    );
  });

  it('no-ops when neither the local dk nor the server envelope exist', async () => {
    await expect(
      selfHealKeyBlob({ transport: new FakeKeyTransport(), keyStore: new FakeKvStore() })
    ).resolves.toBeUndefined();
  });
});
