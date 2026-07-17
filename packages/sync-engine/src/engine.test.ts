import { DecryptError, deriveMasterKey, parseRecoveryCode, unwrapDataKey } from '@cuewise/crypto';
import { configurePlatform } from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import { SessionManager, SYNC_PULL_WAKE_ID } from '@cuewise/sync-client';
import { goalFactory } from '@cuewise/test-utils/factories';
import { describe, expect, it, vi } from 'vitest';
import { FakeApiClient, FakeSyncServer } from './__fixtures__/fake-api-client';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeScheduler } from './__fixtures__/fake-scheduler';
import {
  CLOUD_SYNC_ENABLED_KEY,
  LAST_SYNCED_AT_KEY,
  SyncEngine,
  type SyncEngineDeps,
} from './engine';
import { loadPersistedDataKey, RecoveryCodeRequiredError, SYNC_DATA_KEY } from './key-lifecycle';
import { SyncMetadataStore } from './metadata-store';
import { MutationTracker } from './mutation-tracker';

interface Device {
  kv: FakeKvStore;
  apiClient: FakeApiClient;
  scheduler: FakeScheduler;
  engine: SyncEngine;
  onStatus: ReturnType<typeof vi.fn>;
  onRecoveryCode: ReturnType<typeof vi.fn>;
}

/** Builds one "device": its own storage/scheduler/session, sharing the given fake server. */
function createDevice(server: FakeSyncServer, overrides: Partial<SyncEngineDeps> = {}): Device {
  const kv = new FakeKvStore();
  const apiClient = new FakeApiClient(server);
  const scheduler = new FakeScheduler();
  const onStatus = vi.fn();
  const onRecoveryCode = vi.fn();
  const engine = new SyncEngine({
    apiClient,
    sessionManager: new SessionManager(kv),
    keyStore: kv,
    scheduler,
    onStatus,
    onRecoveryCode,
    ...overrides,
  });
  return { kv, apiClient, scheduler, engine, onStatus, onRecoveryCode };
}

/** Points the shared @cuewise/storage helpers at this device's backend for the next await chain. */
function useStorage(device: Pick<Device, 'kv'>): void {
  configurePlatform({ storage: device.kv });
}

describe('SyncEngine.enableSync', () => {
  it('walks a brand-new account to active, fires onRecoveryCode, and uploads a seeded goal', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const goal = goalFactory.build({ id: 'g1' });
    await setGoals([goal]);

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(device.engine.getStatus()).toBe('active');
    expect(device.onStatus.mock.calls.map((call) => call[0])).toEqual([
      'signing_in',
      'key_init',
      'initial_sync',
      'active',
    ]);
    expect(device.onRecoveryCode).toHaveBeenCalledTimes(1);
    const uploaded = server
      .allRecords()
      .some((r) => r.collection === 'goals' && r.entityId === 'g1' && !r.deleted);
    expect(uploaded).toBe(true);
  });

  it('exchanges the token with the given sign-in provider', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    await device.engine.enableSync('google', 'google-id-token', 'Device A');

    expect(device.apiClient.lastExchangeRequest).toEqual({
      provider: 'google',
      credential: 'google-id-token',
      deviceName: 'Device A',
    });
  });

  it('forwards a codeVerifier on google exchanges so bounced codes stay PKCE-bound', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    await device.engine.enableSync('google', 'bounced-code', 'Device A', {
      codeVerifier: 'verifier-x',
    });

    expect(device.apiClient.lastExchangeRequest).toEqual({
      provider: 'google',
      credential: 'bounced-code',
      deviceName: 'Device A',
      codeVerifier: 'verifier-x',
    });
  });

  it('stamps lastSyncedAt on success, skips it on failure, and hydrates it on restart', async () => {
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);

    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    expect(device.engine.getLastSyncedAt()).toBe(5_000);

    // A failed cycle must not move the stamp.
    t = 6_000;
    device.apiClient.rejectNextGetChangesWithNetworkError = true;
    await expect(device.engine.syncNow()).rejects.toMatchObject({ code: 'network_error' });
    expect(device.engine.getLastSyncedAt()).toBe(5_000);

    // A restarted engine hydrates the persisted stamp (its own fresh sync is made to fail,
    // so the value can only have come from storage).
    device.apiClient.rejectNextGetChangesWithNetworkError = true;
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
      now: () => 9_999,
    });
    await restarted.start();
    expect(restarted.getLastSyncedAt()).toBe(5_000);
  });

  it('a lastSyncedAt persistence failure is log-only: the sync still succeeds, memory updates', async () => {
    // Guards against a refactor routing stampLastSynced through throwIfFailed — that would
    // reject every successful sync cycle after the data already synced.
    let t = 7_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 8_000;
    device.kv.failSetsForKey = LAST_SYNCED_AT_KEY;
    await device.engine.syncNow();

    expect(device.engine.getLastSyncedAt()).toBe(8_000);
    device.kv.failSetsForKey = null;
  });

  it('never stamps lastSyncedAt on the DK-less no-op path, and disableSync clears it', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    await device.engine.syncNow();
    expect(device.engine.getLastSyncedAt()).toBeNull();

    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    expect(device.engine.getLastSyncedAt()).not.toBeNull();

    await device.engine.disableSync();
    expect(device.engine.getLastSyncedAt()).toBeNull();
  });

  it('getAccount returns the api result with a session and null when signed out', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    device.apiClient.accountResult = { userId: 'u1', email: 'kes@example.com' };

    expect(await device.engine.getAccount()).toBeNull();

    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    expect(await device.engine.getAccount()).toEqual({ userId: 'u1', email: 'kes@example.com' });
  });

  it('getAccount resolves null on a 401 without auth-loss side effects', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    device.apiClient.rejectNextGetAccountWith401 = true;
    expect(await device.engine.getAccount()).toBeNull();

    // Informational call: the session and status must be untouched, and a retry succeeds.
    expect(device.engine.getStatus()).toBe('active');
    expect(await device.engine.getAccount()).not.toBeNull();
  });

  it('downloads existing server data into a fresh device enrolling with the recovery code', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    const goal = goalFactory.build({ id: 'g1' });
    await setGoals([goal]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server);
    useStorage(deviceB);

    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    expect(deviceB.engine.getStatus()).toBe('active');
    const goals = await getGoals();
    expect(goals.map((g) => g.id)).toContain('g1');
  });

  it('unions distinct local data on both sides instead of one clobbering the other', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g-a' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server);
    useStorage(deviceB);
    await setGoals([goalFactory.build({ id: 'g-b' })]);

    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    const goals = await getGoals();
    expect(goals.map((g) => g.id).sort()).toEqual(['g-a', 'g-b']);
  });

  it('enroll-with-code (device #2) walks through enrolling, not key_init', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server);
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    const statuses = deviceB.onStatus.mock.calls.map((call) => call[0]);
    expect(statuses).toContain('enrolling');
    expect(statuses).not.toContain('key_init');
  });

  it('a 401 from exchangeToken leaves status signed_out with local data intact and no DK persisted', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const goal = goalFactory.build({ id: 'g1' });
    await setGoals([goal]);
    device.apiClient.rejectExchangeWith401 = true;

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(device.engine.getStatus()).toBe('signed_out');
    expect(await getGoals()).toEqual([goal]);
    expect(await device.kv.get(SYNC_DATA_KEY, 'local')).toBeNull();
  });

  it('arms the pull wake after a successful enable', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(device.scheduler.scheduled.some((s) => s.id === SYNC_PULL_WAKE_ID)).toBe(true);
  });

  it('a 401 on the pull during enableSync stops at signed_out without enabling sync or arming the wake', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    // Key init persists the DK, then the initial-sync pull 401s — the guard must return early.
    device.apiClient.rejectNextGetChangesWith401 = true;

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(device.engine.getStatus()).toBe('signed_out');
    expect(await device.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).not.toBe(true);
    expect(device.scheduler.scheduled.some((s) => s.id === SYNC_PULL_WAKE_ID)).toBe(false);
  });

  it('leaves status disabled (not error) when enroll needs a recovery code', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');

    const deviceB = createDevice(server);
    useStorage(deviceB);

    await expect(deviceB.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toThrow(
      RecoveryCodeRequiredError
    );

    expect(deviceB.engine.getStatus()).toBe('disabled');
    expect(deviceB.onStatus).not.toHaveBeenCalledWith('error');
  });
});

describe('SyncEngine.syncNow', () => {
  it('calls getChanges before pushChanges', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.engine.markMutated('goals', 'g1');
    device.apiClient.callOrder.length = 0;

    await device.engine.syncNow();

    expect(device.apiClient.callOrder).toEqual(['getChanges', 'pushChanges']);
  });

  it('a 401 mid-sync drops to signed_out without clearing the DK or touching local data', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const goal = goalFactory.build({ id: 'g1' });
    await setGoals([goal]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    expect(device.engine.getStatus()).toBe('active');

    device.apiClient.rejectAllWith401 = true;
    await device.engine.syncNow();

    expect(device.engine.getStatus()).toBe('signed_out');
    expect(await device.kv.get(SYNC_DATA_KEY, 'local')).not.toBeNull();
    expect(await getGoals()).toEqual([goal]);
  });

  it('is a no-op before any DK is held', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    await device.engine.syncNow();

    expect(device.apiClient.callOrder).toEqual([]);
  });
});

describe('SyncEngine.disableSync', () => {
  it('clears status/DK/enabled-flag but leaves local domain data untouched', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const goal = goalFactory.build({ id: 'g1' });
    await setGoals([goal]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    await device.engine.disableSync();

    expect(device.engine.getStatus()).toBe('disabled');
    expect(await device.kv.get(SYNC_DATA_KEY, 'local')).toBeNull();
    expect(await device.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).toBeNull();
    expect(await getGoals()).toEqual([goal]);
  });
});

describe('SyncEngine.start / stop', () => {
  it('is a no-op when sync was never enabled on this device', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    await device.engine.start();

    expect(device.engine.getStatus()).toBe('disabled');
    expect(device.scheduler.scheduled).toEqual([]);
  });

  it('self-heals the DK, syncs, and arms the pull loop for a restarted engine instance', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    // Simulate an app restart: a fresh SyncEngine over the same persisted keyStore.
    const restartedScheduler = new FakeScheduler();
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: restartedScheduler,
    });

    await restarted.start();

    expect(restarted.getStatus()).toBe('active');
    expect(restartedScheduler.scheduled.some((s) => s.id === SYNC_PULL_WAKE_ID)).toBe(true);
  });

  it('a failed initial sync during start still arms the pull loop instead of leaving it dead', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    const restartedScheduler = new FakeScheduler();
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: restartedScheduler,
    });
    device.apiClient.rejectNextGetChangesWithNetworkError = true;

    await restarted.start();

    expect(restarted.getStatus()).toBe('active');
    expect(restartedScheduler.scheduled.some((s) => s.id === SYNC_PULL_WAKE_ID)).toBe(true);
  });

  it('stop cancels the armed pull wake', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    await device.engine.stop();

    expect(device.scheduler.cancelled).toContain(SYNC_PULL_WAKE_ID);
  });
});

describe('SyncEngine.handlePullWake', () => {
  it('swallows a transient network error, re-arms the wake, and recovers on the next call', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.apiClient.rejectNextGetChangesWithNetworkError = true;

    await expect(device.engine.handlePullWake()).resolves.toBeUndefined();

    expect(device.engine.getStatus()).toBe('active');
    expect(device.scheduler.scheduled.some((s) => s.id === SYNC_PULL_WAKE_ID)).toBe(true);

    await device.engine.markMutated('goals', 'g1');
    device.apiClient.callOrder.length = 0;
    await device.engine.handlePullWake();

    expect(device.apiClient.callOrder).toEqual(['getChanges', 'pushChanges']);
  });

  it('a 401 during the wake drops to signed_out and does not re-arm', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.apiClient.rejectAllWith401 = true;
    device.scheduler.cancelled.length = 0;
    // enableSync itself arms the loop (E1) — reset so this only observes the wake's own behavior.
    device.scheduler.scheduled.length = 0;

    await device.engine.handlePullWake();

    expect(device.engine.getStatus()).toBe('signed_out');
    expect(device.scheduler.cancelled).toContain(SYNC_PULL_WAKE_ID);
    expect(device.scheduler.scheduled).toEqual([]);
  });
});

describe('SyncEngine.markMutated / markDeleted', () => {
  it('delegate to the mutation tracker', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const metaStore = new SyncMetadataStore(device.kv);

    await device.engine.markMutated('goals', 'g1');
    expect((await metaStore.load()).dirty.goals).toEqual(['g1']);

    await device.engine.markDeleted('goals', 'g1');
    expect((await metaStore.load()).tombstones).toContain('goals/g1');
  });
});

describe('SyncEngine.markMutatedBulk', () => {
  it('delegates to the mutation tracker with the full id list', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const metaStore = new SyncMetadataStore(device.kv);

    await device.engine.markMutatedBulk('goals', ['g1', 'g2']);

    expect((await metaStore.load()).dirty.goals).toEqual(['g1', 'g2']);
  });
});

describe('SyncEngine backfillDirty (first-enable migration)', () => {
  it('marks every seeded entity dirty via one markMutatedBulk call per collection, not one markMutated per entity', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const goals = [
      goalFactory.build({ id: 'g1' }),
      goalFactory.build({ id: 'g2' }),
      goalFactory.build({ id: 'g3' }),
    ];
    await setGoals(goals);
    const bulkSpy = vi.spyOn(MutationTracker.prototype, 'markMutatedBulk');
    const singleSpy = vi.spyOn(MutationTracker.prototype, 'markMutated');

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    // Batched, not per-entity: backfill never falls back to the single-id path.
    expect(singleSpy).not.toHaveBeenCalled();
    const goalsCall = bulkSpy.mock.calls.find(([collection]) => collection === 'goals');
    expect(goalsCall?.[1].slice().sort()).toEqual(['g1', 'g2', 'g3']);

    // Same end result as the old per-entity backfill: every seeded goal reaches the server.
    const uploadedIds = server
      .allRecords()
      .filter((r) => r.collection === 'goals' && !r.deleted)
      .map((r) => r.entityId);
    expect(uploadedIds.slice().sort()).toEqual(['g1', 'g2', 'g3']);
  });

  it('skips collections with nothing to backfill instead of calling markMutatedBulk with an empty list', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const bulkSpy = vi.spyOn(MutationTracker.prototype, 'markMutatedBulk');

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    const emptyCalls = bulkSpy.mock.calls.filter(([, entityIds]) => entityIds.length === 0);
    expect(emptyCalls).toEqual([]);
  });
});

describe('SyncEngine.regenerateRecoveryCode', () => {
  it('rotates the recovery code: the old code stops unwrapping, the new one works', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const oldCode = device.onRecoveryCode.mock.calls[0][0] as string;

    const newCode = await device.engine.regenerateRecoveryCode();

    expect(newCode).not.toBe(oldCode);
    const envelope = server.getRecoveryEnvelope();
    expect(envelope).not.toBeNull();
    if (envelope === null) {
      throw new Error('envelope missing after regenerate');
    }
    const persisted = await loadPersistedDataKey(device.kv);
    expect(persisted).not.toBeNull();
    if (persisted === null) {
      throw new Error('data key missing after regenerate');
    }

    // New code unwraps the rotated envelope to the same, unchanged data key.
    const newMk = await deriveMasterKey(await parseRecoveryCode(newCode));
    const unwrapped = await unwrapDataKey(newMk, envelope.envelope);
    expect(unwrapped.dk).toEqual(persisted.dk);

    // Old code no longer unwraps it — the server envelope was overwritten, not appended.
    const oldMk = await deriveMasterKey(await parseRecoveryCode(oldCode));
    await expect(unwrapDataKey(oldMk, envelope.envelope)).rejects.toThrow(DecryptError);
  });

  it('throws when regenerating with no active session', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    await expect(device.engine.regenerateRecoveryCode()).rejects.toThrow();
  });
});
