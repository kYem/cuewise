import {
  DecryptError,
  deriveMasterKey,
  parseRecoveryCode,
  RecoveryCodeError,
  unwrapDataKey,
} from '@cuewise/crypto';
import { configurePlatform, logger, storageFailure } from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import { ApiError, SessionManager, SYNC_PULL_WAKE_ID } from '@cuewise/sync-client';
import { goalFactory } from '@cuewise/test-utils/factories';
import { describe, expect, it, vi } from 'vitest';
import { FakeApiClient, FakeSyncServer } from './__fixtures__/fake-api-client';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeScheduler } from './__fixtures__/fake-scheduler';
import { type CollectionBinding, defaultBindings } from './collections';
import {
  CLOUD_SYNC_ENABLED_KEY,
  LAST_CYCLE_KEY,
  LAST_SYNCED_AT_KEY,
  SyncEngine,
  type SyncEngineDeps,
  type SyncStatus,
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

/**
 * A cold MV3 worker: a fresh engine over the same key store, its own first cycle parked mid-pull, so
 * whatever getLastCycle() answers can only have come from hydration. `finish` releases the cycle.
 */
function coldStart(
  device: Device,
  now: number
): { engine: SyncEngine; finish: () => Promise<void> } {
  let release = () => {};
  const parked = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async () => {
    await parked;
    return { records: [], cursor: 0 };
  });
  const engine = new SyncEngine({
    apiClient: device.apiClient,
    sessionManager: new SessionManager(device.kv),
    keyStore: device.kv,
    scheduler: device.scheduler,
    now: () => now,
  });
  const started = engine.start();
  return {
    engine,
    finish: async () => {
      release();
      await started;
    },
  };
}

/** Points the shared @cuewise/storage helpers at this device's backend for the next await chain. */
function useStorage(device: Pick<Device, 'kv'>): void {
  configurePlatform({ storage: device.kv });
}

/** Default bindings with goals unable to persist anything — a device at its storage quota. */
function bindingsThatCannotWriteGoals(): CollectionBinding[] {
  return defaultBindings().map((binding) => {
    if (binding.name !== 'goals') {
      return binding;
    }
    return { ...binding, writeOne: async () => storageFailure('quota exceeded') };
  });
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
    const failed = await device.engine.syncNow();
    expect(failed).toMatchObject({ kind: 'failed', reason: 'network' });
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

  it('resumeEnrollWithCode finishes a needs-code enroll on the live session, no re-exchange', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server);
    useStorage(deviceB);
    // A first enable with no code lands at needs-code but leaves the session saved.
    await expect(deviceB.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toBeInstanceOf(
      RecoveryCodeRequiredError
    );
    const exchangesBefore = deviceB.apiClient.exchangeCount;

    await deviceB.engine.resumeEnrollWithCode(recoveryCode);

    expect(deviceB.engine.getStatus()).toBe('active');
    expect(deviceB.apiClient.exchangeCount).toBe(exchangesBefore); // no second token exchange
    expect((await getGoals()).map((g) => g.id)).toContain('g1');
  });

  it('resumeEnrollWithCode maps a bad code to RecoveryCodeError and stays disabled', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');

    const deviceB = createDevice(server);
    useStorage(deviceB);
    await expect(deviceB.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toBeInstanceOf(
      RecoveryCodeRequiredError
    );

    await expect(
      deviceB.engine.resumeEnrollWithCode('CW1-00000-00000-00000-00000-00000-00000')
    ).rejects.toBeInstanceOf(RecoveryCodeError);
    expect(deviceB.engine.getStatus()).toBe('disabled');
  });

  it('resumeEnrollWithCode without a saved session lands signed_out', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    await device.engine.resumeEnrollWithCode('CW1-00000-00000-00000-00000-00000-00000');

    expect(device.engine.getStatus()).toBe('signed_out');
    expect(device.apiClient.exchangeCount).toBe(0);
  });

  it('resumeEnrollWithCode still lands signed_out when the wake cancel rejects', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    vi.spyOn(FakeScheduler.prototype, 'cancel').mockRejectedValue(new Error('scheduler fault'));

    await device.engine.resumeEnrollWithCode('CW1-00000-00000-00000-00000-00000-00000');

    // A failed cleanup step must not escape into handleEnableError and repaint this as `error`.
    expect(device.engine.getStatus()).toBe('signed_out');
    expect(device.onStatus).not.toHaveBeenCalledWith('error');
  });

  it('resumeEnrollWithCode lands signed_out (no throw) when the live-looking session 401s mid-enroll', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server);
    useStorage(deviceB);
    await expect(deviceB.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toBeInstanceOf(
      RecoveryCodeRequiredError
    );
    // The session passes the local token guard but the server has since revoked it.
    deviceB.apiClient.rejectAllWith401 = true;

    await expect(deviceB.engine.resumeEnrollWithCode(recoveryCode)).resolves.toBeUndefined();
    expect(deviceB.engine.getStatus()).toBe('signed_out');
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

  it('finishes enable when the initial sync fails transiently, leaving the retry to the pull loop', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    // The DK is already enrolled by the time the pull runs, so a transient cycle failure is not
    // a failed enrolment — the device is enrolled and the next wake retries.
    device.apiClient.rejectNextGetChangesWithNetworkError = true;

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(device.engine.getStatus()).toBe('active');
    expect(device.engine.getLastSyncedAt()).toBeNull();
    expect(device.scheduler.scheduled.some((s) => s.id === SYNC_PULL_WAKE_ID)).toBe(true);
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

  it('reports a completed cycle and stamps it', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'synced' });
    expect(device.engine.getLastSyncedAt()).not.toBeNull();
  });

  it('reports a missing key without stamping', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);

    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'no-key' });
    expect(device.engine.getLastSyncedAt()).toBeNull();
  });

  it('reports a refused cursor without stamping', async () => {
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    device.apiClient.rejectNextGetChangesWithResync();
    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'resynced' });
    expect(device.engine.getLastSyncedAt()).toBe(5_000);
  });

  it('returns a classified failure rather than throwing, and does not stamp', async () => {
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    const serverError = new ApiError('internal', 500);
    device.apiClient.rejectNextGetChanges(serverError);
    const outcome = await device.engine.syncNow();

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.reason).toBe('server');
      expect(outcome.error).toBe(serverError);
    }
    expect(device.engine.getLastSyncedAt()).toBe(5_000);
  });

  it('reports a pull that stopped on a failed local write as a device failure, without stamping', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    // Device B cannot write what it pulls (e.g. local quota), so its cursor never advances.
    const deviceB = createDevice(server, { bindings: bindingsThatCannotWriteGoals() });
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    const outcome = await deviceB.engine.syncNow();

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'device' });
    expect(deviceB.engine.getLastSyncedAt()).toBeNull();
  });

  it('still pushes local changes when the pull stalled, so the wedge is inbound only', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server, { bindings: bindingsThatCannotWriteGoals() });
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    const localGoal = goalFactory.build({ id: 'gb1' });
    await setGoals([localGoal]);
    await deviceB.engine.markMutated('goals', 'gb1');
    deviceB.apiClient.callOrder.length = 0;

    const outcome = await deviceB.engine.syncNow();

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'device' });
    expect(deviceB.apiClient.callOrder).toEqual(['getChanges', 'pushChanges']);
    const uploaded = server.allRecords().some((r) => r.entityId === 'gb1');
    expect(uploaded).toBe(true);
  });

  it('reports the stall, not the network, when the push after a stalled pull also fails', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server, { bindings: bindingsThatCannotWriteGoals() });
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    await setGoals([goalFactory.build({ id: 'gb1' })]);
    await deviceB.engine.markMutated('goals', 'gb1');
    deviceB.apiClient.callOrder.length = 0;
    // Wi-Fi drops between the pull and the push; the device is still wedged on a LOCAL write, and
    // reporting `network` would promise it recovers when connectivity returns. It does not.
    deviceB.apiClient.rejectNextPushChanges(new ApiError('network_error', 0));

    const outcome = await deviceB.engine.syncNow();

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'device' });
    expect(deviceB.apiClient.callOrder).toEqual(['getChanges', 'pushChanges']);
  });

  it("carries the outranked push error as the stall error's cause, so nothing is dropped", async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server, { bindings: bindingsThatCannotWriteGoals() });
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    await setGoals([goalFactory.build({ id: 'gb1' })]);
    await deviceB.engine.markMutated('goals', 'gb1');
    const pushError = new ApiError('network_error', 0);
    deviceB.apiClient.rejectNextPushChanges(pushError);

    const outcome = await deviceB.engine.syncNow();

    // The stall is what gets reported, but the push error is the only record of the second
    // failure — welded to the reported error rather than logged separately below the ship level.
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'device' });
    if (outcome.kind === 'failed') {
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).cause).toBe(pushError);
    }
  });

  it('names the reason and the outranked push error in the logged message text', async () => {
    // `message` and `cause` are both non-enumerable: a surface that stringifies or JSON-serialises
    // an object payload drops them silently. Only the log's own message text is always rendered.
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server, { bindings: bindingsThatCannotWriteGoals() });
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    await setGoals([goalFactory.build({ id: 'gb1' })]);
    await deviceB.engine.markMutated('goals', 'gb1');
    deviceB.apiClient.rejectNextPushChanges(new ApiError('network_error', 0));
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await deviceB.engine.syncNow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Sync cycle failed \(device\);.*the same cycle's push also failed: network_error$/
      ),
      expect.any(Error)
    );
  });

  it('leaves an own `cause` off a stall with no push failure behind it', async () => {
    // Passing the options bag unconditionally gives a clean stall an own `cause` of undefined,
    // which reads as "there was a second failure" to anything that checks for the property.
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server, { bindings: bindingsThatCannotWriteGoals() });
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    const outcome = await deviceB.engine.syncNow();

    expect(outcome).toMatchObject({ kind: 'failed', reason: 'device' });
    if (outcome.kind === 'failed') {
      expect(Object.hasOwn(outcome.error as Error, 'cause')).toBe(false);
      expect((outcome.error as Error).message).not.toContain('push');
    }
  });

  it('reports signed-out when the push after a stalled pull 401s, so auth loss still cleans up', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server, { bindings: bindingsThatCannotWriteGoals() });
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'cred-b', 'Device B', { recoveryCode });

    await setGoals([goalFactory.build({ id: 'gb1' })]);
    await deviceB.engine.markMutated('goals', 'gb1');
    deviceB.apiClient.rejectNextPushChanges(new ApiError('invalid_token', 401));

    const outcome = await deviceB.engine.syncNow();

    expect(outcome).toEqual({ kind: 'signed-out' });
    expect(deviceB.engine.getStatus()).toBe('signed_out');
  });

  it('logs a failed cycle for a caller that is not the pull wake', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await device.engine.syncNow();

    // A manual "Sync now" against a broken backend must leave a trace too, not just the wake.
    expect(errorSpy).toHaveBeenCalledWith(
      'Sync cycle failed (server); the next scheduled wake will retry: internal',
      expect.any(ApiError)
    );
  });

  it('names the cause of a failed best-effort step in the message, not in a payload', async () => {
    // `message` is non-enumerable, so an { error } payload renders as {} on a JSON surface — the
    // cause has to be re-stated as text or a permanently broken step reports nothing usable.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    device.kv.throwSetsForKey = LAST_SYNCED_AT_KEY;
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await device.engine.syncNow();

    expect(errorSpy).toHaveBeenCalledWith(
      `Sync cycle lastSyncedAt stamp failed; the reported outcome still stands: FakeKvStore: simulated adapter fault writing ${LAST_SYNCED_AT_KEY}`,
      expect.any(Error)
    );
  });

  it('resolves the outcome when persisting the stamp rejects', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    device.kv.throwSetsForKey = LAST_SYNCED_AT_KEY;

    await expect(device.engine.syncNow()).resolves.toEqual({ kind: 'synced' });
  });

  it('lands signed_out and still cancels the wake when clearing the session rejects', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    vi.spyOn(SessionManager.prototype, 'clear').mockRejectedValue(new Error('storage fault'));
    device.apiClient.rejectAllWith401 = true;

    await expect(device.engine.syncNow()).resolves.toEqual({ kind: 'signed-out' });

    expect(device.engine.getStatus()).toBe('signed_out');
    expect(device.scheduler.cancelled).toContain(SYNC_PULL_WAKE_ID);
  });

  it('lands signed_out and still clears the session when cancelling the wake rejects', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    vi.spyOn(FakeScheduler.prototype, 'cancel').mockRejectedValue(new Error('scheduler fault'));
    device.apiClient.rejectAllWith401 = true;

    await expect(device.engine.syncNow()).resolves.toEqual({ kind: 'signed-out' });

    expect(device.engine.getStatus()).toBe('signed_out');
    expect(await new SessionManager(device.kv).getToken()).toBeNull();
  });

  it('resolves signed-out when the auth-loss cleanup itself throws', async () => {
    const server = new FakeSyncServer();
    const onStatus = vi.fn((status: SyncStatus) => {
      if (status === 'signed_out') {
        throw new Error('host status listener blew up');
      }
    });
    const device = createDevice(server, { onStatus });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    device.apiClient.rejectAllWith401 = true;

    await expect(device.engine.syncNow()).resolves.toEqual({ kind: 'signed-out' });
    expect(device.engine.getStatus()).toBe('signed_out');
    // The steps are independent: a throwing status listener must not skip either cleanup.
    expect(await new SessionManager(device.kv).getToken()).toBeNull();
    expect(device.scheduler.cancelled).toContain(SYNC_PULL_WAKE_ID);
  });

  it('records the last cycle for callers that did not run it', async () => {
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    device.apiClient.rejectNextGetChangesWithResync();
    await device.engine.syncNow();

    expect(device.engine.getLastCycle()).toEqual({
      known: true,
      cycle: { at: 6_000, outcome: { kind: 'resynced' } },
    });
  });

  it('overwrites a stored failure once a cycle succeeds, so it cannot outlive its fix', async () => {
    // The reason the record is written on EVERY cycle and not only failures: without this a device
    // that failed once wears the badge across every restart, forever.
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    await device.engine.syncNow();
    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toMatchObject({ kind: 'failed' });

    t = 7_000;
    await device.engine.syncNow();

    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toEqual({ at: 7_000, kind: 'synced' });
  });

  it('leaves a real cycle as the answer when a DK-less wake beats the key load', async () => {
    // MV3 registers the alarm listener before start() resolves, so a cold worker can run a cycle
    // with no key. That no-op reports nothing about the device and must not erase the failure.
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    await device.engine.syncNow();

    // A fresh engine over the same store that never ran start(), so it holds no DK.
    const keyless = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
      now: () => 9_999,
    });

    await expect(keyless.syncNow()).resolves.toEqual({ kind: 'no-key' });

    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toEqual({
      at: 6_000,
      kind: 'failed',
      reason: 'server',
    });
    await keyless.ensureHydrated();
    expect(keyless.getLastCycle()).toEqual({
      known: true,
      cycle: { at: 6_000, outcome: { kind: 'failed', reason: 'server', error: undefined } },
    });
  });

  it('persists the cycle without the error object, which no storage round trip could carry', async () => {
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    await device.engine.syncNow();

    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toEqual({
      at: 6_000,
      kind: 'failed',
      reason: 'server',
    });
  });

  it('hydrates the failed cycle a cold worker never ran, so the teardown does not hide it', async () => {
    // The MV3 case: the wake fails, the worker dies 30s later, and the panel's control message
    // cold-starts a fresh one that must not answer "no cycle" for a device failing every wake.
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    await device.engine.syncNow();

    const cold = coldStart(device, 9_999);

    await vi.waitFor(() => {
      expect(cold.engine.getLastCycle()).toEqual({
        known: true,
        // 6_000, not 9_999: this engine's own cycle is parked, so only hydration can have answered.
        cycle: { at: 6_000, outcome: { kind: 'failed', reason: 'server', error: undefined } },
      });
    });
    await cold.finish();
  });

  it('reports a stored cycle whose kind this build does not know as unknown, not as none', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.kv.set(LAST_CYCLE_KEY, { at: 1_000, kind: 'wedged' }, 'local');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const cold = coldStart(device, 9_999);

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        'The stored last sync cycle is not a cycle record; reporting it as unknown',
        { key: LAST_CYCLE_KEY, shape: '{at,kind}' }
      );
    });
    expect(cold.engine.getLastCycle()).toEqual({ known: false });
    await cold.finish();
  });

  it('reports a stored cycle with a non-numeric timestamp as unknown', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.kv.set(LAST_CYCLE_KEY, { at: 'ages ago', kind: 'synced' }, 'local');

    const cold = coldStart(device, 9_999);

    await vi.waitFor(() => {
      expect(cold.engine.getLastCycle()).toEqual({ known: false });
    });
    await cold.finish();
  });

  it('reports an unreadable stored cycle as unknown rather than as no cycle', async () => {
    // The distinction the whole read exists for: a record that cannot be read says nothing about
    // the device, while "no cycle" is the one answer allowed to clear the panel's badge.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.kv.unreadableKey = LAST_CYCLE_KEY;
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const cold = coldStart(device, 9_999);

    await vi.waitFor(() => {
      expect(cold.engine.getLastCycle()).toEqual({ known: false });
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'The stored last sync cycle is unreadable; reporting it as unknown',
      { key: LAST_CYCLE_KEY }
    );
    await cold.finish();
  });

  it('keeps a cycle this process ran when the stored record turns out unreadable', async () => {
    // handlePullWake syncs without awaiting hydration, so a read that fails afterwards must not
    // mask the failure that cycle already recorded — it is the badge, not a guess about storage.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    await device.engine.syncNow();

    device.kv.failGetManyForKey = LAST_CYCLE_KEY;
    await device.engine.ensureHydrated();

    expect(device.engine.getLastCycle()).toMatchObject({
      known: true,
      cycle: { outcome: { kind: 'failed', reason: 'server' } },
    });
  });

  it('reports an unreadable stamp as unreadable, not as the wrong shape', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    device.kv.unreadableKey = LAST_SYNCED_AT_KEY;

    const cold = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
    });
    await cold.ensureHydrated();

    expect(cold.getLastSyncedAt()).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('The stored last-synced stamp is unreadable', {
      key: LAST_SYNCED_AT_KEY,
    });
  });

  it('refuses a stored stamp that is not a number, rather than rendering Invalid Date', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await device.kv.set(LAST_SYNCED_AT_KEY, 'yesterday', 'local');

    const cold = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
    });
    await cold.ensureHydrated();

    expect(cold.getLastSyncedAt()).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('The stored last-synced stamp is not a number', {
      key: LAST_SYNCED_AT_KEY,
      shape: 'string',
    });
  });

  it('reports unknown when the whole hydration read fails', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.kv.failGetManyForKey = LAST_CYCLE_KEY;

    const cold = coldStart(device, 9_999);

    await vi.waitFor(() => {
      expect(cold.engine.getLastCycle()).toEqual({ known: false });
    });
    await cold.finish();
  });

  it('leaves an unknown cycle unknown when a DK-less wake runs after a failed hydration', async () => {
    // The shipped bug restated: if the no-key no-op flipped the flag, the panel would read
    // {known:true, cycle:null} — "no cycle has run" — and clear a wedged device's badge.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.kv.set(LAST_CYCLE_KEY, { at: 1, kind: 'wedged' }, 'local');

    const keyless = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
    });
    await keyless.ensureHydrated();
    expect(keyless.getLastCycle()).toEqual({ known: false });

    await expect(keyless.syncNow()).resolves.toEqual({ kind: 'no-key' });

    expect(keyless.getLastCycle()).toEqual({ known: false });
  });

  it('does not let hydration replace a failure this process is holding in memory', async () => {
    // A refused persist leaves the failure in memory only while storage still holds an older
    // success; hydrating over it would swap a live failure for a stale healthy record.
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    device.kv.failSetsForKey = LAST_CYCLE_KEY;
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    await device.engine.syncNow();
    device.kv.failSetsForKey = null;

    await device.engine.ensureHydrated();

    expect(device.engine.getLastCycle()).toMatchObject({
      known: true,
      cycle: { at: 6_000, outcome: { kind: 'failed', reason: 'server' } },
    });
  });

  it('does not let hydration replace a stamp this process set', async () => {
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.kv.set(LAST_SYNCED_AT_KEY, 1_000, 'local');

    // The refused write is what makes storage and memory disagree. Without it syncNow persists
    // 7_000 over the seed and hydration reads back the very number the assertion expects, so the
    // guard under test could be deleted and this would still pass.
    t = 7_000;
    device.kv.failSetsForKey = LAST_SYNCED_AT_KEY;
    await device.engine.syncNow();
    device.kv.failSetsForKey = null;
    expect(await device.kv.get(LAST_SYNCED_AT_KEY, 'local')).toBe(1_000);

    await device.engine.ensureHydrated();

    expect(device.engine.getLastSyncedAt()).toBe(7_000);
  });

  it('reads the persisted state once, so every later caller is answered from memory', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const getMany = vi.spyOn(device.kv, 'getMany');

    await device.engine.ensureHydrated();
    await device.engine.ensureHydrated();

    const cycleReads = getMany.mock.calls.filter((call) => call[0].includes(LAST_CYCLE_KEY));
    expect(cycleReads).toHaveLength(1);
  });

  it('re-reads after a failed hydration, so the panel retry is not handed a cached failure', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    await device.engine.syncNow();

    const cold = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
      now: () => 9_999,
    });
    device.kv.failGetManyForKey = LAST_CYCLE_KEY;
    await cold.ensureHydrated();
    expect(cold.getLastCycle()).toEqual({ known: false });

    device.kv.failGetManyForKey = null;
    await cold.ensureHydrated();

    expect(cold.getLastCycle()).toMatchObject({
      known: true,
      cycle: { outcome: { kind: 'failed', reason: 'server' } },
    });
  });

  it('does not let a superseded read that throws downgrade the account that replaced it', async () => {
    // The catch is the one write path the epoch did not cover: disable nulls lastCycle, which opens
    // markLastCycleUnknown's guard, so a stale throw would report a gone account as unreadable.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    let failRead = () => {};
    const parked = new Promise<never>((_resolve, reject) => {
      failRead = () => reject(new Error('storage is on fire'));
    });
    const cold = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
    });
    vi.spyOn(device.kv, 'getMany').mockImplementation((keys) =>
      keys.includes(LAST_CYCLE_KEY) ? parked : Promise.resolve({})
    );

    const hydrating = cold.ensureHydrated();
    await cold.disableSync();
    failRead();
    await hydrating;

    expect(cold.getLastCycle()).toEqual({ known: true, cycle: null });
  });

  it('does not reject when the store throws instead of reporting a failed read', async () => {
    // start() awaits hydration before self-heal, so a rejection would leave the engine keyless
    // behind a pill the extension still persists as active — and skipping the unknown branches
    // would answer "no cycle has run", which clears the badge.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.kv, 'getMany').mockRejectedValue(new Error('storage is on fire'));

    const engine = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
    });

    await expect(engine.ensureHydrated()).resolves.toBeUndefined();
    expect(engine.getLastCycle()).toEqual({ known: false });
    expect(errorSpy).toHaveBeenCalledWith(
      'Could not read the persisted sync state: storage is on fire',
      expect.any(Error)
    );
  });

  it('drops a hydration snapshot that a disable superseded mid-read', async () => {
    // The stored stamp describes an account that is gone, and hydrate's `=== null` guards cannot
    // tell disable's own reset from "nothing hydrated yet".
    let t = 5_000;
    const server = new FakeSyncServer();
    const device = createDevice(server, { now: () => t });
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    t = 6_000;
    let releaseRead = () => {};
    const parkedRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const realGetMany = device.kv.getMany.bind(device.kv);
    vi.spyOn(device.kv, 'getMany').mockImplementation(async (keys, area) => {
      const result = await realGetMany(keys, area);
      // Only the hydration read parks — disableSync's own reads must still complete, or the
      // await below deadlocks instead of exercising the race.
      if (keys.includes(LAST_CYCLE_KEY)) {
        await parkedRead;
      }
      return result;
    });

    const cold = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
      now: () => 9_999,
    });
    const hydrating = cold.ensureHydrated();
    await cold.disableSync();
    releaseRead();
    await hydrating;

    expect(cold.getLastSyncedAt()).toBeNull();
    expect(cold.getLastCycle()).toEqual({ known: true, cycle: null });
  });

  it('resolves the outcome when persisting the last cycle rejects', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    device.kv.throwSetsForKey = LAST_CYCLE_KEY;

    await expect(device.engine.syncNow()).resolves.toEqual({ kind: 'synced' });
    expect(device.engine.getLastCycle()).toMatchObject({ known: true });
  });

  it('names the cause when the last-cycle write is refused rather than thrown', async () => {
    // The shipped logLevel is 'error', so this must not be a warn: losing the record is what lets
    // a wedged device show nothing but "Last synced" after the next teardown.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    device.kv.failSetsForKey = LAST_CYCLE_KEY;
    await device.engine.syncNow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist the last sync cycle: quota exceeded'),
      expect.objectContaining({ message: 'quota exceeded' })
    );
  });

  it('reports signed-out on a 401 instead of leaving the caller to re-read the status', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    device.apiClient.rejectAllWith401 = true;
    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'signed-out' });
    expect(device.engine.getStatus()).toBe('signed_out');
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

  it('clears the last cycle so a stale failure cannot outlive the account', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.apiClient.rejectNextGetChanges(new ApiError('internal', 500));
    await device.engine.syncNow();
    expect(device.engine.getLastCycle()).toMatchObject({ known: true, cycle: expect.anything() });

    await device.engine.disableSync();

    expect(device.engine.getLastCycle()).toEqual({ known: true, cycle: null });
    // The persisted copy too, or the next start() hydrates the previous account's failure.
    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toBeNull();
  });

  it('stops reporting unknown after a disable, since "no cycle" is then the truth', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    // A fresh engine, so no in-session cycle outranks what storage cannot read.
    const cold = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: device.scheduler,
    });
    device.kv.unreadableKey = LAST_CYCLE_KEY;
    await cold.ensureHydrated();
    expect(cold.getLastCycle()).toEqual({ known: false });

    await cold.disableSync();

    expect(cold.getLastCycle()).toEqual({ known: true, cycle: null });
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

  it('reports signed_out when the enabled flag outlived the data key', async () => {
    // Without a status the extension's persisted pill keeps claiming active for a device that will
    // never sync — the reconnect affordance is the only honest surface.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // Neither the key nor an envelope, so selfHealKeyBlob falls through without throwing and the
    // keyless branch is reached rather than its signed-out sibling.
    await device.kv.remove(SYNC_DATA_KEY, 'local');
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockResolvedValue(null);
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: new FakeScheduler(),
    });

    await restarted.start();

    expect(restarted.getStatus()).toBe('signed_out');
    expect(errorSpy).toHaveBeenCalledWith(
      "Cloud sync is enabled but this device's data key could not be read; it will not sync until it reconnects"
    );
  });

  it('does not report a deliberate disable as a missing key, nor resurrect its pill', async () => {
    // The disable message is what wakes a cold worker, and selfHealKeyBlob is a network hop, so a
    // disable routinely lands inside start(). Reporting the user's own action as a defect at error
    // level would fire on every wake of a device they turned off.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: new FakeScheduler(),
    });
    // Disable lands while self-heal is on the wire.
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockImplementation(async () => {
      await restarted.disableSync();
      return null;
    });

    await restarted.start();

    expect(restarted.getStatus()).toBe('disabled');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not report a disable that lands after self-heal as a missing key', async () => {
    // Reaches start()'s SECOND epoch gate, which its sibling test cannot: self-heal succeeds here,
    // so the disable has to land in the key read that follows it.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: new FakeScheduler(),
    });
    // Self-heal reads the key first and finds it; the disable then lands in loadPersistedDataKey's
    // own read, so start() resumes to find the key gone with a matching epoch unless it re-checks.
    let selfHealDone = false;
    const realGet = device.kv.get.bind(device.kv);
    vi.spyOn(device.kv, 'get').mockImplementation(async (key, area) => {
      if (key === SYNC_DATA_KEY && selfHealDone) {
        await restarted.disableSync();
        return realGet(key, area);
      }
      const value = await realGet(key, area);
      if (key === SYNC_DATA_KEY) {
        selfHealDone = true;
      }
      return value;
    });

    await restarted.start();

    expect(restarted.getStatus()).toBe('disabled');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('names whichever key survived a disable, not only the session token', async () => {
    // A surviving enabled flag re-activates sync on the next start() for a removed account.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.kv, 'remove').mockImplementation(async (key) => key !== CLOUD_SYNC_ENABLED_KEY);

    await device.engine.disableSync();

    expect(errorSpy).toHaveBeenCalledWith(
      `Disable could not remove every sync key: ${CLOUD_SYNC_ENABLED_KEY}`
    );
  });

  it('does not re-arm the pull wake when a disable lands inside its own first cycle', async () => {
    // start() epoch-checks before activating, but its cycle is a full network round trip after
    // that. disableSync cancels the wake; re-arming past it polls on for a removed account.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    const restartedScheduler = new FakeScheduler();
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: restartedScheduler,
    });
    // The disable lands while start()'s own cycle is on the wire.
    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async () => {
      await restarted.disableSync();
      return { records: [], cursor: 0 };
    });

    await restarted.start();

    expect(restarted.getStatus()).toBe('disabled');
    expect(restartedScheduler.scheduled).toEqual([]);
  });

  it('drops a cycle that finished after a disable, rather than re-creating its keys', async () => {
    // runCycle captured the DK before the disable, so the cycle still succeeds. Stamping it would
    // re-create the two keys disableSync just removed, and hand them to the next account.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async () => {
      await device.engine.disableSync();
      return { records: [], cursor: 0 };
    });
    await device.engine.syncNow();

    expect(await device.kv.get(LAST_SYNCED_AT_KEY, 'local')).toBeNull();
    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toBeNull();
    expect(device.engine.getStatus()).toBe('disabled');
  });

  it('completes a disable whose metadata reset fails, instead of stranding it half-done', async () => {
    // resetMeta throws deterministically on an unreadable ledger. Running it first left the keys
    // gone, the pill still active, and the user told to retry a disable that had already happened.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.kv, 'getMany').mockResolvedValue(null);

    await expect(device.engine.disableSync()).resolves.toBeUndefined();

    expect(device.engine.getStatus()).toBe('disabled');
    expect(await device.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('disable metadata reset failed'),
      expect.anything()
    );
  });

  it('names the session token when it is the key that survived a disable', async () => {
    // The one surviving key that is a live credential: it keeps isSignedIn() answering true.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.kv, 'remove').mockImplementation(async (key) => key !== 'syncSession');

    await device.engine.disableSync();

    expect(errorSpy).toHaveBeenCalledWith('Disable could not remove every sync key: syncSession');
  });

  it('stops re-arming once a stale wake fires on a device whose sync is off', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.engine.disableSync();
    device.scheduler.scheduled.length = 0;

    await device.engine.handlePullWake();

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

  it('logs a failed cycle at error level with the original error, not just its reason', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    device.apiClient.rejectNextGetChangesWithNetworkError = true;
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await device.engine.handlePullWake();

    expect(errorSpy).toHaveBeenCalledWith(
      'Sync cycle failed (network); the next scheduled wake will retry: network_error',
      expect.any(ApiError)
    );
    errorSpy.mockRestore();
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

  it('does not paint a disabled device active on a pull wake', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.engine.disableSync();

    await device.engine.handlePullWake();

    expect(device.engine.getStatus()).toBe('disabled');
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
