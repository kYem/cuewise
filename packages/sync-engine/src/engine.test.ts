import {
  DecryptError,
  deriveMasterKey,
  parseRecoveryCode,
  RecoveryCodeError,
  unwrapDataKey,
} from '@cuewise/crypto';
import { configurePlatform, logger, storageFailure } from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import {
  ApiError,
  SessionManager,
  SYNC_PULL_WAKE_ID,
  SYNC_SESSION_KEY,
} from '@cuewise/sync-client';
import { goalFactory } from '@cuewise/test-utils/factories';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeApiClient, FakeSyncServer } from './__fixtures__/fake-api-client';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeScheduler } from './__fixtures__/fake-scheduler';
import { type CollectionBinding, defaultBindings } from './collections';
import {
  CLOUD_SYNC_ENABLED_KEY,
  LAST_CYCLE_KEY,
  LAST_SYNCED_AT_KEY,
  RECOVERY_ENVELOPE_KEY,
  SyncEngine,
  type SyncEngineDeps,
  type SyncStatus,
} from './engine';
import { loadPersistedDataKey, RecoveryCodeRequiredError, SYNC_DATA_KEY } from './key-lifecycle';
import { SYNC_META_KEY, SyncMetadataStore } from './metadata-store';
import { MutationTracker } from './mutation-tracker';

interface Device {
  kv: FakeKvStore;
  apiClient: FakeApiClient;
  scheduler: FakeScheduler;
  engine: SyncEngine;
  onStatus: ReturnType<typeof vi.fn>;
  onRecoveryCode: ReturnType<typeof vi.fn>;
}

// Every engine createDevice makes, so afterEach can stop() each one — a markMutated call under
// real timers arms a real 2s setTimeout, and nothing else in this file ever cancels it.
let devices: Device[] = [];

afterEach(async () => {
  // Best-effort: some tests mock scheduler.cancel to reject, and restoreMocks only undoes that
  // before the NEXT test starts — a rejection here must not turn an already-passed test red.
  await Promise.all(devices.map((device) => device.engine.stop().catch(() => {})));
  devices = [];
});

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
  const device = { kv, apiClient, scheduler, engine, onStatus, onRecoveryCode };
  devices.push(device);
  return device;
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

/**
 * A respawned worker: a fresh engine over the same device's storage and transport, so only what
 * was persisted survives. Registered for the afterEach stop() like any other device engine.
 */
function restart(device: Device, scheduler: FakeScheduler = new FakeScheduler()): SyncEngine {
  const engine = new SyncEngine({
    apiClient: device.apiClient,
    sessionManager: new SessionManager(device.kv),
    keyStore: device.kv,
    scheduler,
  });
  devices.push({ ...device, scheduler, engine });
  return engine;
}

/** Points the shared @cuewise/storage helpers at this device's backend for the next await chain. */
function useStorage(device: Pick<Device, 'kv'>): void {
  configurePlatform({ storage: device.kv });
}

/** Forgets what this device already pulled, so the server's own records replay from seq 0. */
async function replayFromScratch(device: Pick<Device, 'kv'>): Promise<void> {
  const metaStore = new SyncMetadataStore(device.kv);
  const meta = await metaStore.load();
  meta.cursor = 0;
  meta.hlcs = {};
  await metaStore.save(meta);
  await setGoals([]);
}

/** Finds the goals binding or fails loudly — avoids a non-null assertion at call sites. */
function requireGoalsBinding(bindings: CollectionBinding[]): CollectionBinding {
  const goals = bindings.find((binding) => binding.name === 'goals');
  if (goals === undefined) {
    throw new Error('binding not found: goals');
  }
  return goals;
}

/** A disable landing mid-pull: it fires once, while the first pulled goal is being written. */
function disableWhileWritingGoals(bindings: CollectionBinding[], engine: SyncEngine): void {
  const goals = requireGoalsBinding(bindings);
  const write = goals.writeOne.bind(goals);
  let disabled = false;
  vi.spyOn(goals, 'writeOne').mockImplementation(async (entityId, entity) => {
    const result = await write(entityId, entity);
    if (!disabled) {
      disabled = true;
      await engine.disableSync();
    }
    return result;
  });
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

  it('does not persist the enabled flag when a disable lands during the initial sync', async () => {
    // Persisting it would re-arm sync on the next start() for the account just removed.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async () => {
      await device.engine.disableSync();
      return { records: [], cursor: 0 };
    });

    const setSpy = vi.spyOn(device.kv, 'set');

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    // Never written, not written-then-removed: the removal is best-effort, so a failed one would
    // leave the flag set with no key and land the next start() on needs_enroll.
    expect(setSpy.mock.calls.filter((call) => call[0] === CLOUD_SYNC_ENABLED_KEY)).toEqual([]);
    expect(await device.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).toBeNull();
    expect(device.engine.getStatus()).toBe('disabled');
  });

  it('does not persist the enabled flag when a disable lands before the cycle even starts', async () => {
    const server = new FakeSyncServer();
    const bindings = defaultBindings();
    const device = createDevice(server, { bindings });
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const goals = requireGoalsBinding(bindings);
    const readAll = goals.readAll.bind(goals);
    // Returns the real library, so backfillDirty still writes to the ledger the disable cleared.
    vi.spyOn(goals, 'readAll').mockImplementation(async () => {
      await device.engine.disableSync();
      return readAll();
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(await device.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).toBeNull();
    expect(device.engine.getStatus()).toBe('disabled');
    // backfillDirty wrote to the ledger disableSync had just cleared; walking away would leave a
    // disconnected device holding a dirty set naming every goal it has.
    expect((await new SyncMetadataStore(device.kv).load()).dirty).toEqual({});
  });

  it('reports disabled the moment an enrol is abandoned, not whatever status it was mid-way through', async () => {
    // disableSync writes its own 'disabled' LAST, after several awaited storage hops, so the
    // abandoned enable's unwind gets there first — and both hosts read this status to decide
    // whether the connect worked.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    let releaseDisable = () => {};
    const parked = new Promise<void>((resolve) => {
      releaseDisable = resolve;
    });
    // Parks the disable on its first hop, before it can write its own status.
    vi.spyOn(device.scheduler, 'cancel').mockImplementation(async () => {
      await parked;
    });
    let disabling: Promise<void> = Promise.resolve();
    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async () => {
      disabling = device.engine.disableSync();
      return { records: [], cursor: 0 };
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(device.engine.getStatus()).toBe('disabled');

    releaseDisable();
    await disabling;
  });

  it('does not complete an enable whose account was removed during sign-in', async () => {
    // The window a snapshot taken inside enrollAndActivate cannot see: the epoch has already
    // moved by the time it reads it, so every later checkpoint compares equal.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    vi.spyOn(device.apiClient, 'exchangeToken').mockImplementation(async () => {
      await device.engine.disableSync();
      return { token: 'fake-token-1' };
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(await device.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).toBeNull();
    expect(await device.kv.get(SYNC_DATA_KEY, 'local')).toBeNull();
    expect(device.engine.getStatus()).toBe('disabled');
  });

  // The throw path reaches abandonEnroll too, and it used to pass `undefined` — so an enable that
  // minted an account and then failed said nothing about the code being the only way back into it.
  it('still names the minted code when the abandoned enrol threw rather than returned', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const set = device.kv.set.bind(device.kv);
    vi.spyOn(device.kv, 'set').mockImplementation(async (key, value, area) => {
      if (key !== CLOUD_SYNC_ENABLED_KEY) {
        return set(key, value, area);
      }
      // Disable first, so handleEnableError sees a superseded enrol, then fail the write so it
      // arrives there by throwing rather than by returning.
      await device.engine.disableSync();
      return storageFailure('quota exceeded');
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync enable was abandoned after creating an account; its recovery code is the only way back into it'
    );
  });

  // Same engine, second attempt: without a per-attempt reset the first enable's mint would make
  // this abandonment claim a code that this attempt never created.
  it('does not let an earlier mint speak for a later abandoned enrol on the same engine', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = device.onRecoveryCode.mock.calls[0][0] as string;
    await device.engine.disableSync();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    // Same throw-and-supersede shape as the test above, so this reaches handleEnableError — the
    // one path that reads the field rather than the enrol's own local.
    const set = device.kv.set.bind(device.kv);
    vi.spyOn(device.kv, 'set').mockImplementation(async (key, value, area) => {
      if (key !== CLOUD_SYNC_ENABLED_KEY) {
        return set(key, value, area);
      }
      await device.engine.disableSync();
      return storageFailure('quota exceeded');
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A', { recoveryCode });

    expect(errorSpy).not.toHaveBeenCalledWith(
      'Cloud sync enable was abandoned after creating an account; its recovery code is the only way back into it'
    );
  });

  it('does not claim an account was created when the abandoned enrol only joined one', async () => {
    // Device #2 enrols with an existing code and mints nothing, so the "its recovery code is the
    // only way back" error would be pointing at a code the user already has.
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;
    const deviceB = createDevice(server);
    useStorage(deviceB);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(deviceB.apiClient, 'getChanges').mockImplementation(async () => {
      await deviceB.engine.disableSync();
      return { records: [], cursor: 0 };
    });

    await deviceB.engine.enableSync('dev', 'cred-a', 'Device B', { recoveryCode });

    expect(errorSpy).not.toHaveBeenCalledWith(
      'Cloud sync enable was abandoned after creating an account; its recovery code is the only way back into it'
    );
    errorSpy.mockRestore();
  });

  it('does not report the disconnect-provoked 401 as a fault, which is the ordinary case', async () => {
    // disableSync clears the session, so an enrol caught mid-flight usually 401s. Logging that at
    // error puts an ordinary user action in the extension's Errors panel as a defect.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockImplementation(async () => {
      await device.engine.disableSync();
      throw new ApiError('invalid_token', 401);
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Cloud sync enable failed as it was abandoned'),
      expect.anything()
    );
    expect(device.engine.getStatus()).toBe('disabled');
    errorSpy.mockRestore();
  });

  it('names a session clear its adapter threw on, rather than letting it escape', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    device.kv.throwRemovesForKey = SYNC_SESSION_KEY;
    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async () => {
      await device.engine.disableSync();
      return { records: [], cursor: 0 };
    });

    await expect(device.engine.enableSync('dev', 'cred-a', 'Device A')).resolves.toBeUndefined();

    expect(device.engine.getStatus()).toBe('disabled');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cloud sync rollback threw clearing the session'),
      expect.anything()
    );
    errorSpy.mockRestore();
  });

  it('names the key an abandoned enrol could not roll back, rather than reporting success', async () => {
    // `remove` reports failure by returning false, never by throwing, so a bestEffort wrapper
    // alone would call a failed rollback a success.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    device.kv.failRemovesForKey = SYNC_DATA_KEY;
    vi.spyOn(device.apiClient, 'putRecoveryEnvelope').mockImplementation(async () => {
      await device.engine.disableSync();
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(errorSpy).toHaveBeenCalledWith(
      `Cloud sync abandoned an enable but could not remove its data key: ${SYNC_DATA_KEY}`
    );
    errorSpy.mockRestore();
  });

  it('drops the stamp and the cycle record when a disable lands inside those very writes', async () => {
    // The epoch check runs before them, so only a re-check afterwards keeps a removed account's
    // "Last synced" from being hydrated onto whatever account comes next.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    let disabled = false;
    const write = device.kv.set.bind(device.kv);
    vi.spyOn(device.kv, 'set').mockImplementation(async (key, value, area) => {
      if (key === LAST_SYNCED_AT_KEY && !disabled) {
        disabled = true;
        await device.engine.disableSync();
      }
      return write(key, value, area);
    });

    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(await device.kv.get(LAST_SYNCED_AT_KEY, 'local')).toBeNull();
    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toBeNull();
    expect(device.engine.getLastSyncedAt()).toBeNull();
    // In memory too: left set, getLastCycle answers with the removed account's cycle and
    // lastCycleKnown stays true, so no later read ever corrects it.
    expect(device.engine.getLastCycle()).toEqual({ known: true, cycle: null });
  });

  it('answers an enable that threw after a disconnect as cancelled, not as a failure', async () => {
    // The throw path: without its own epoch gate the panel toasts a failure for the user's own
    // Disconnect, the host never runs its cancelled branch, and the data key stays adopted.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const write = device.kv.set.bind(device.kv);
    vi.spyOn(device.kv, 'set').mockImplementation(async (key, value, area) => {
      if (key === CLOUD_SYNC_ENABLED_KEY) {
        await device.engine.disableSync();
        return storageFailure('quota exceeded');
      }
      return write(key, value, area);
    });

    await expect(device.engine.enableSync('dev', 'cred-a', 'Device A')).resolves.toBeUndefined();

    expect(device.engine.getStatus()).toBe('disabled');
    expect(await device.kv.get(SYNC_DATA_KEY, 'local')).toBeNull();
    errorSpy.mockRestore();
  });

  it('reports a device fault behind an abandoned enable rather than burying it', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const write = device.kv.set.bind(device.kv);
    vi.spyOn(device.kv, 'set').mockImplementation(async (key, value, area) => {
      if (key === CLOUD_SYNC_ENABLED_KEY) {
        await device.engine.disableSync();
        return storageFailure('quota exceeded');
      }
      return write(key, value, area);
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cloud sync enable failed as it was abandoned'),
      expect.anything()
    );
    errorSpy.mockRestore();
  });

  it('names a rollback its adapter threw on, rather than letting it escape the enable', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    device.kv.throwRemovesForKey = SYNC_DATA_KEY;
    vi.spyOn(device.apiClient, 'putRecoveryEnvelope').mockImplementation(async () => {
      await device.engine.disableSync();
    });

    await expect(device.engine.enableSync('dev', 'cred-a', 'Device A')).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Cloud sync rollback threw removing ${SYNC_DATA_KEY}`),
      expect.anything()
    );
    errorSpy.mockRestore();
  });

  it('clears a session an abandoned enrol persisted, so the panel cannot name its account', async () => {
    // disableSync clears the session BEFORE this enrol's saveToken writes it, so only the
    // rollback can remove it — and a live token keeps getAccount answering for that account.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    vi.spyOn(device.apiClient, 'exchangeToken').mockImplementation(async () => {
      await device.engine.disableSync();
      return { token: 'fake-token-1' };
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(await device.kv.get(SYNC_SESSION_KEY, 'local')).toBeNull();
    expect(await device.engine.getAccount()).toBeNull();
  });

  it('rolls back the data key when a disable lands during the enrol itself', async () => {
    // Left on disk it would seal the NEXT account's records under a key whose server holds no
    // envelope for it, making that device's records unreadable on every other device.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    vi.spyOn(device.apiClient, 'putRecoveryEnvelope').mockImplementation(async () => {
      await device.engine.disableSync();
    });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(await device.kv.get(SYNC_DATA_KEY, 'local')).toBeNull();
    expect(await device.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).toBeNull();
    expect(device.engine.getStatus()).toBe('disabled');
    expect(device.onRecoveryCode).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync enable was abandoned after creating an account; its recovery code is the only way back into it'
    );
    errorSpy.mockRestore();
  });

  it('does not upload the removed account a whole cycle when the enrol is abandoned', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' }), goalFactory.build({ id: 'g2' })]);
    vi.spyOn(device.apiClient, 'putRecoveryEnvelope').mockImplementation(async () => {
      await device.engine.disableSync();
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(device.apiClient.callOrder).not.toContain('pushChanges');
    expect(await device.kv.get(LAST_SYNCED_AT_KEY, 'local')).toBeNull();
  });

  it('rolls the enabled flag back when a disable lands inside the write itself', async () => {
    // Left set with no data key, the next start() lands needs_enroll and demands a recovery code
    // for the account the user disconnected.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    let disabled = false;
    const write = device.kv.set.bind(device.kv);
    vi.spyOn(device.kv, 'set').mockImplementation(async (key, value, area) => {
      if (key === CLOUD_SYNC_ENABLED_KEY && !disabled) {
        disabled = true;
        await device.engine.disableSync();
      }
      return write(key, value, area);
    });

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(await device.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).toBeNull();
    expect(device.engine.getStatus()).toBe('disabled');
  });

  it('discards a pull cursor left behind by a disable whose metadata reset failed', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const recoveryCode = device.onRecoveryCode.mock.calls[0][0] as string;
    await device.engine.syncNow();
    expect((await new SyncMetadataStore(device.kv).load()).cursor).toBeGreaterThan(0);

    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const getMany = vi.spyOn(device.kv, 'getMany').mockResolvedValue(null);
    await device.engine.disableSync();
    getMany.mockRestore();
    errorSpy.mockRestore();
    const getChanges = vi.spyOn(device.apiClient, 'getChanges');

    await device.engine.enableSync('dev', 'cred-a', 'Device A', { recoveryCode });

    expect(getChanges).toHaveBeenCalledWith(0);
  });

  it('leaves the rest of the ledger alone when an enable discards the cursor', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.engine.syncNow();
    const metaStore = new SyncMetadataStore(device.kv);
    const seeded = await metaStore.load();
    seeded.cursor = 42;
    seeded.quarantine = ['goals/g-poison'];
    seeded.tombstones = ['goals/g-deleted'];
    await metaStore.save(seeded);
    const getChanges = vi.spyOn(device.apiClient, 'getChanges');

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(getChanges).toHaveBeenCalledWith(0);
    const after = await metaStore.load();
    // A widened reset would re-quarantine the same record on the next pull, re-toasting forever,
    // and a dropped tombstone would resurrect a locally-deleted entity.
    expect(after.quarantine).toEqual(['goals/g-poison']);
    expect(after.tombstones).toEqual(['goals/g-deleted']);
  });

  it('discards the cursor on a re-auth too, which can land on a different account', async () => {
    // The enabled flag cannot answer "is this cursor mine": it survives handleAuthLoss, and a
    // reconnect re-runs the provider's account chooser.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.engine.syncNow();
    expect((await new SyncMetadataStore(device.kv).load()).cursor).toBeGreaterThan(0);
    const getChanges = vi.spyOn(device.apiClient, 'getChanges');

    await device.engine.enableSync('dev', 'cred-b', 'Device A');

    expect(getChanges).toHaveBeenCalledWith(0);
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

  // The one disable key that is a live credential: left behind, isSignedIn() keeps answering true
  // for an account this device has just lost authorisation to.
  it('names the session token when auth loss cannot clear it', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.kv, 'remove').mockResolvedValue(false);
    device.apiClient.rejectAllWith401 = true;

    await device.engine.syncNow();

    expect(device.engine.getStatus()).toBe('signed_out');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(SYNC_SESSION_KEY));
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
      `Cloud sync lastSyncedAt stamp failed; what it belongs to still stands: FakeKvStore: simulated adapter fault writing ${LAST_SYNCED_AT_KEY}`,
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
    // start() awaits hydration before the key check, so a rejection would leave the engine keyless
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

describe('SyncEngine.resumeEnrollWithCode', () => {
  it('answers a disable that lands inside it with disabled, not a sign-in expiry', async () => {
    const server = new FakeSyncServer();
    const sessionManager = new SessionManager(new FakeKvStore());
    const device = createDevice(server, { sessionManager });
    useStorage(device);
    // The session is gone because the disable cleared it, mid-resume.
    vi.spyOn(sessionManager, 'getToken').mockImplementation(async () => {
      await device.engine.disableSync();
      return null;
    });

    await device.engine.resumeEnrollWithCode('CW1-ABC');

    expect(device.engine.getStatus()).toBe('disabled');
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

  it('stops applying a pull the moment it lands, leaving the rest of the page unwritten', async () => {
    const server = new FakeSyncServer();
    const bindings = defaultBindings();
    const device = createDevice(server, { bindings });
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' }), goalFactory.build({ id: 'g2' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await replayFromScratch(device);
    disableWhileWritingGoals(bindings, device.engine);

    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(await getGoals()).toHaveLength(1);
    expect(await device.kv.get(LAST_SYNCED_AT_KEY, 'local')).toBeNull();
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

describe('SyncEngine.refreshRecoveryEnvelope', () => {
  it('reports a missing envelope and says how to restore it', async () => {
    // The key is here, so the device still syncs; what it has lost is the way back from this
    // device dying. Regenerate recovery code, the one repair, lives in the panel that just asked.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockResolvedValue(null);

    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBe(false);

    expect(device.engine.getStatus()).toBe('active');
    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync has no recovery envelope on the server; regenerate your recovery code to restore it'
    );
  });

  it('names a missing envelope once, not on every panel open', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockResolvedValue(null);
    await device.engine.refreshRecoveryEnvelope();
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(restart(device).refreshRecoveryEnvelope()).resolves.toBe(false);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('retires the finding once Regenerate rebuilds the envelope', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const missing = vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockResolvedValue(null);
    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBe(false);
    missing.mockRestore();

    await device.engine.regenerateRecoveryCode();

    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBe(true);
  });

  it('keeps the last known answer when the server cannot be reached', async () => {
    // An unreachable server is not a missing envelope: answering false here would tell a perfectly
    // recoverable account it has no way back, every time it opened Settings offline.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockRejectedValue(new Error('offline'));

    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBe(true);
  });

  it('does not ask a signed-out device to check, and keeps what it last knew', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await new SessionManager(device.kv).clear();
    const envelopeSpy = vi.spyOn(device.apiClient, 'getRecoveryEnvelope');

    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBe(true);

    expect(envelopeSpy).not.toHaveBeenCalled();
  });

  it('records nothing when the disable lands after the fetch, inside the record read', async () => {
    // The narrower window the gate above cannot see. Concretely reachable: the extension runs
    // 'details' outside the control-message mutex, so a Disconnect click does overlap a lookup.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockResolvedValue(null);
    const read = device.kv.get.bind(device.kv);
    let disabled = false;
    vi.spyOn(device.kv, 'get').mockImplementation(async (key, area) => {
      const value = await read(key, area);
      if (key === RECOVERY_ENVELOPE_KEY && !disabled) {
        disabled = true;
        await device.engine.disableSync();
      }
      return value;
    });

    // Unknown, not false: nothing was recorded, so nothing may be painted from it either.
    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBeNull();

    // disableSync removed it; writing the fetched answer back re-creates it for the next account.
    await expect(read(RECOVERY_ENVELOPE_KEY, 'local')).resolves.toBeNull();
  });

  it('does not let a stale "absent" outrank a Regenerate that landed while it was on the wire', async () => {
    // Regenerate PUT an envelope, so a read that started before it is older news. Recording it
    // would re-raise the banner the click just retired, on an account that now has a recovery path.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    let regenerated = false;
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockImplementation(async () => {
      if (!regenerated) {
        regenerated = true;
        await device.engine.regenerateRecoveryCode();
      }
      return null;
    });

    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBe(true);

    await expect(device.kv.get(RECOVERY_ENVELOPE_KEY, 'local')).resolves.toBe(true);
  });

  it('never rejects, even when the storage adapter throws', async () => {
    // getDetails is contracted never to reject and this call writes as well as fetches, so the
    // contract has to hold by construction rather than because today's adapters swallow errors.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const read = device.kv.get.bind(device.kv);
    vi.spyOn(device.kv, 'get').mockImplementation(async (key, area) => {
      if (key === RECOVERY_ENVELOPE_KEY) {
        throw new Error('adapter exploded');
      }
      return read(key, area);
    });

    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBe(true);
  });

  it('records nothing for an account that was disabled mid-check', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockImplementation(async () => {
      await device.engine.disableSync();
      return null;
    });

    await expect(device.engine.refreshRecoveryEnvelope()).resolves.toBeNull();

    // Left behind, this is the previous account's badge waiting for whichever one connects next.
    await expect(device.kv.get(RECOVERY_ENVELOPE_KEY, 'local')).resolves.toBeNull();
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

  it('never asks the server about the recovery envelope while the data key is here', async () => {
    // ENG-98. The answer drives one settings banner and nothing else, and the panel asks for
    // itself — on the extension this ran per worker spawn, ~288 requests a day for a closed panel.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const envelopeSpy = vi.spyOn(device.apiClient, 'getRecoveryEnvelope');

    const scheduler = new FakeScheduler();
    const restarted = restart(device, scheduler);
    await restarted.start();

    expect(envelopeSpy).not.toHaveBeenCalled();
    expect(restarted.getStatus()).toBe('active');
    expect(scheduler.scheduled).not.toEqual([]);
  });

  it('asks for the recovery code when the key is gone and the server cannot be reached', async () => {
    // The fetch is load-bearing only here, and an unanswerable one must still not leave a keyless
    // device claiming to sync — the fall-through hands it to the key load, which says reconnect.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockRejectedValue(new Error('offline'));
    await device.kv.remove(SYNC_DATA_KEY, 'local');

    const scheduler = new FakeScheduler();
    const restarted = restart(device, scheduler);
    await restarted.start();

    expect(restarted.getStatus()).toBe('needs_enroll');
    expect(scheduler.scheduled).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync could not check its data key: offline',
      expect.any(Error)
    );
  });

  it('signs out when the key is gone and the envelope fetch is refused', async () => {
    // Without this branch an expired session falls through to active and arms the wake — a
    // signed-out device claiming to sync, forever.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockRejectedValue(
      new ApiError('unauthorized', 401)
    );
    await device.kv.remove(SYNC_DATA_KEY, 'local');

    const scheduler = new FakeScheduler();
    const restarted = restart(device, scheduler);
    await restarted.start();

    expect(restarted.getStatus()).toBe('signed_out');
    expect(scheduler.scheduled).toEqual([]);
  });

  it('signs out through its own first cycle when the key is here but the session expired', async () => {
    // start() makes no request of its own while the key is on disk (ENG-98), so the cycle it runs
    // next is what finds the expired session. It passes through 'active' on the way; the settled
    // status and the un-armed wake are what the pill and the tray end up on.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const envelopeSpy = vi.spyOn(device.apiClient, 'getRecoveryEnvelope');
    device.apiClient.rejectNextGetChangesWith401 = true;

    const scheduler = new FakeScheduler();
    const restarted = restart(device, scheduler);
    await restarted.start();

    expect(envelopeSpy).not.toHaveBeenCalled();
    expect(restarted.getStatus()).toBe('signed_out');
    expect(scheduler.scheduled).toEqual([]);
  });

  it('reports needs_enroll for the ordinary lost-key case, where the envelope still exists', async () => {
    // Every account that enabled sync has an envelope, so the key check throws NeedsEnroll here rather
    // than falling through — the common path, and it used to claim the sign-in had expired.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await device.kv.remove(SYNC_DATA_KEY, 'local');
    const scheduler = new FakeScheduler();
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler,
    });

    await restarted.start();

    expect(restarted.getStatus()).toBe('needs_enroll');
    expect(errorSpy).toHaveBeenCalledWith(
      "Cloud sync needs the recovery code: this device's data key could not be read"
    );
  });

  it('keeps a needs_enroll device on its prompt when the enroll asks for a code', async () => {
    // Following the prompt must not flip the panel to off — this device is still enrolled here.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await device.kv.remove(SYNC_DATA_KEY, 'local');
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: new FakeScheduler(),
    });
    await restarted.start();
    expect(restarted.getStatus()).toBe('needs_enroll');

    // Reconnect with no code: the envelope is still there, so the enroll asks for one.
    await expect(restarted.enableSync('dev', 'cred-a', 'Device A')).rejects.toThrow(
      RecoveryCodeRequiredError
    );

    expect(restarted.getStatus()).toBe('needs_enroll');
  });

  it('reports a fresh key minted for a device that was already enrolled', async () => {
    // Every record the old key sealed is unopenable after this, and other devices keep it — the
    // user only sees an ordinary new-code modal.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // Key gone AND the account's envelope gone, so the enroll mints rather than restores.
    await device.kv.remove(SYNC_DATA_KEY, 'local');
    device.apiClient = new FakeApiClient(new FakeSyncServer());
    const rekeyed = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: new FakeScheduler(),
    });
    await rekeyed.enableSync('dev', 'cred-a', 'Device A');

    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync minted a new data key for an already-enrolled device'
    );
  });

  it('stays quiet about a minted key on a brand-new enable', async () => {
    // The inverse guard: an error on every first-ever enable would train the reader to ignore it.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(errorSpy).not.toHaveBeenCalledWith(
      'Cloud sync minted a new data key for an already-enrolled device'
    );
  });

  it('keeps a needs_enroll device on its prompt when a resumed enroll rejects the code', async () => {
    // resumeEnrollWithCode is the live-session path, and a mistyped code is its likeliest outcome —
    // flipping to off there hides the prompt that asked for the code.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await device.kv.remove(SYNC_DATA_KEY, 'local');
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler: new FakeScheduler(),
    });
    await restarted.start();
    expect(restarted.getStatus()).toBe('needs_enroll');

    await expect(restarted.resumeEnrollWithCode('not-a-real-code')).rejects.toThrow(
      RecoveryCodeError
    );

    expect(restarted.getStatus()).toBe('needs_enroll');
  });

  it('keeps a device that retried from error on the prompt too, not only needs_enroll', async () => {
    // Retry routes through reconnect, so an error-state device reaches the same needs-code exit.
    // Naming one status here folded every other start into "off" while the code modal was open.
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');

    const deviceB = createDevice(server);
    useStorage(deviceB);
    vi.spyOn(deviceB.apiClient, 'exchangeToken').mockRejectedValueOnce(new Error('boom'));
    await expect(deviceB.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toThrow('boom');
    expect(deviceB.engine.getStatus()).toBe('error');

    await expect(deviceB.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toThrow(
      RecoveryCodeRequiredError
    );

    expect(deviceB.engine.getStatus()).toBe('needs_enroll');
  });

  it('leaves a first enable that needs a code reading disabled, not enrolled', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    await deviceA.engine.enableSync('dev', 'cred-a', 'Device A');

    const deviceB = createDevice(server);
    useStorage(deviceB);

    await expect(deviceB.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toThrow(
      RecoveryCodeRequiredError
    );

    expect(deviceB.engine.getStatus()).toBe('disabled');
  });

  it('reports needs_enroll when the enabled flag outlived the data key', async () => {
    // The session may be valid and the key is what is gone, so the panel must ask for the code.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    // Neither the key nor an envelope, so checkForLostDataKey falls through without throwing and the
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

    expect(restarted.getStatus()).toBe('needs_enroll');
    expect(errorSpy).toHaveBeenCalledWith(
      "Cloud sync is enabled but this device's data key could not be read; it will not sync until it reconnects"
    );
  });

  it('stops polling a keyless device, since only a recovery code can change its state', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    await device.kv.remove(SYNC_DATA_KEY, 'local');
    vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockResolvedValue(null);

    const scheduler = new FakeScheduler();
    const restarted = new SyncEngine({
      apiClient: device.apiClient,
      sessionManager: new SessionManager(device.kv),
      keyStore: device.kv,
      scheduler,
    });
    await restarted.start();
    // A stale alarm from the enrolled era still fires against the keyless engine.
    await restarted.handlePullWake();

    expect(scheduler.scheduled).toEqual([]);
  });

  it('does not report a deliberate disable as a missing key, nor resurrect its pill', async () => {
    // The disable message is what wakes a cold worker, and start() awaits storage either side of
    // its key check, so a disable routinely lands inside it. Reporting the user's own action as a
    // defect at error level would fire on every wake of a device they turned off.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const restarted = restart(device);
    // Lands during hydration, so the key check that follows finds the disable's cleared DK and
    // raises needs-enroll for an account that is already gone — the epoch, not the error type,
    // is what has to answer that.
    const readMany = device.kv.getMany.bind(device.kv);
    vi.spyOn(device.kv, 'getMany').mockImplementationOnce(async (keys, area) => {
      await restarted.disableSync();
      return readMany(keys, area);
    });

    await restarted.start();

    expect(restarted.getStatus()).toBe('disabled');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not report a disable that lands after the key check as a missing key', async () => {
    // Reaches start()'s SECOND epoch gate, which its sibling test cannot: the key check passes here,
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
    // The disable lands in the push, past every cancellation check, so the cycle does succeed —
    // and stamping it would re-create the two keys disableSync just removed, handing them to
    // whichever account comes next. Reporting it as `synced` would be a lie for the same reason.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await device.engine.markMutated('goals', 'g1');
    vi.spyOn(device.apiClient, 'pushChanges').mockImplementation(async () => {
      await device.engine.disableSync();
      return { cursor: 1 };
    });

    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(await device.kv.get(LAST_SYNCED_AT_KEY, 'local')).toBeNull();
    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toBeNull();
    expect(device.engine.getStatus()).toBe('disabled');
    const ledger = await new SyncMetadataStore(device.kv).load();
    expect(ledger.cursor).toBe(0);
    expect(ledger.hlcs).toEqual({});
  });

  it('drops a whole cycle for an account removed between its pull and its push', async () => {
    // Nothing dirty, so pushOnce returns before its own cancellation check — leaving syncNow's
    // post-cycle epoch check as the only thing between a removed account and a `synced` report.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    let metaReads = 0;
    let disabled = false;
    const readMany = device.kv.getMany.bind(device.kv);
    vi.spyOn(device.kv, 'getMany').mockImplementation(async (keys, area) => {
      const result = await readMany(keys, area);
      if (!keys.includes(SYNC_META_KEY) || disabled) {
        return result;
      }
      metaReads += 1;
      // The third is the push opening its own ledger read; the first two are the pull's snapshot
      // and the re-read its delta write makes. Coupled to that count: a new ledger read anywhere
      // in the cycle re-targets this and must move it.
      if (metaReads === 3) {
        disabled = true;
        await device.engine.disableSync();
      }
      return result;
    });

    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(await device.kv.get(LAST_SYNCED_AT_KEY, 'local')).toBeNull();
    expect(await device.kv.get(LAST_CYCLE_KEY, 'local')).toBeNull();
  });

  it('does not report a sign-in expiry for a cycle whose 401 was the disable clearing the session', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async () => {
      await device.engine.disableSync();
      throw new ApiError('invalid_token', 401);
    });

    const outcome = await device.engine.syncNow();

    expect(outcome).toEqual({ kind: 'cancelled' });
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

  // Bare, a throwing adapter rejects the whole disable and the survived-keys summary never runs —
  // so the one key that is a live credential goes unreported.
  it('completes a disable whose session clear throws, and still names the token', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(device.kv, 'remove').mockImplementation(async (key) => {
      if (key === 'syncSession') {
        throw new Error('storage adapter fault');
      }
      return true;
    });

    await expect(device.engine.disableSync()).resolves.toBeUndefined();

    expect(device.engine.getStatus()).toBe('disabled');
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

  it('recovers the DK, syncs, and arms the pull loop for a restarted engine instance', async () => {
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
  it('seals with the key it checked, even if a disable nulls it mid-flight', async () => {
    // Reachable on the extension since disable stopped queueing behind other ops, and always was
    // on macOS: the narrowing survives an await, the value does not.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    const dk = await loadPersistedDataKey(device.kv);
    expect(dk).not.toBeNull();
    if (dk === null) {
      throw new Error('data key missing before the race');
    }

    const regenerating = device.engine.regenerateRecoveryCode();
    await device.engine.disableSync();
    const code = await regenerating;

    // Not merely "did not throw": the defect is a code that opens nothing, which is what the
    // whole area exists to prevent — a graceful bail-out would satisfy a resolves-to-string.
    const envelope = server.getRecoveryEnvelope();
    expect(envelope).not.toBeNull();
    if (envelope === null) {
      throw new Error('envelope missing after regenerate');
    }
    const mk = await deriveMasterKey(await parseRecoveryCode(code));
    expect((await unwrapDataKey(mk, envelope.envelope)).dk).toEqual(dk.dk);
  });

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

describe('push on change', () => {
  // A failed assertion above the trailing vi.useRealTimers() in a test would otherwise leak
  // fake timers into every test that runs after it in this file.
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes a mutation without waiting for the five-minute wake', async () => {
    vi.useFakeTimers();
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    const goal = goalFactory.build({ id: 'g1' });
    await setGoals([goal]);
    server.reset();
    const syncNow = vi.spyOn(device.engine, 'syncNow');

    await device.engine.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(2_000);
    // The fake clock only drains what it owns, and the push seals with real async crypto, so the
    // cycle that timer fired has to be awaited before asking what reached the server.
    await Promise.all(syncNow.mock.results.map((result) => result.value));

    expect(server.allRecords().some((r) => r.entityId === 'g1')).toBe(true);
    vi.useRealTimers();
  });

  it('coalesces a burst of mutations into one cycle', async () => {
    vi.useFakeTimers();
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const syncNow = vi.spyOn(device.engine, 'syncNow');

    await device.engine.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(500);
    await device.engine.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(500);
    await device.engine.markMutated('goals', 'g1');

    // Each later mutation must replace the pending timer, not add another one alongside it —
    // an uncancelled extra timer would eventually fire its own cycle, just later and unobserved
    // by a short window (cyclesInFlight would mask it as a harmless re-arm).
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(syncNow).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('still ships during a continuous stream of edits, at the max wait', async () => {
    vi.useFakeTimers();
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const syncNow = vi.spyOn(device.engine, 'syncNow');

    // An edit every second forever would reset a plain debounce and never push.
    for (let i = 0; i < 12; i += 1) {
      await device.engine.markMutated('goals', 'g1');
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(syncNow).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('polls at a fixed cadence instead of spinning once an in-flight cycle outlives the max wait', async () => {
    vi.useFakeTimers();
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await setGoals([goalFactory.build({ id: 'g1' })]);

    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = device.apiClient.getChanges.bind(device.apiClient);
    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async (since: number) => {
      await gate;
      return original(since);
    });
    // Attached before "running" so it counts that first call too — see the assertions below.
    const syncNow = vi.spyOn(device.engine, 'syncNow');

    const running = device.engine.syncNow(); // held open past PUSH_MAX_WAIT_MS
    await device.engine.markMutated('goals', 'g1');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    // Past the 10s max wait while the cycle is still stuck: a delay-0 spin would call
    // setTimeout an unbounded number of times in this window instead of polling every 2s.
    await vi.advanceTimersByTimeAsync(12_000);

    // ~12s at a 2s cadence is around 6 re-arms, nowhere near a runaway spin's call volume.
    expect(setTimeoutSpy.mock.calls.length).toBeLessThan(20);
    // Still just the one call ("running" itself): the deferral must not overlap it.
    expect(syncNow).toHaveBeenCalledTimes(1);

    release();
    await running;
    await vi.advanceTimersByTimeAsync(2_000);

    // Once the blocker cleared, the deferred push still ran a cycle of its own.
    expect(syncNow).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  }, 10_000);

  it('defers rather than running a second cycle over one already going', async () => {
    vi.useFakeTimers();
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await setGoals([goalFactory.build({ id: 'g1' })]);

    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = device.apiClient.getChanges.bind(device.apiClient);
    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async (since: number) => {
      await gate;
      return original(since);
    });
    // Attached after enableSync's own cycle, so it only counts calls from here on.
    const syncNow = vi.spyOn(device.engine, 'syncNow');

    const running = device.engine.syncNow();
    await device.engine.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(2_000);

    // The timer fired while the first cycle was still inside getChanges: still just the one call.
    expect(syncNow).toHaveBeenCalledTimes(1);

    release();
    await running;
    await vi.advanceTimersByTimeAsync(2_000);

    // Once the first cycle finished, the deferred push still ran a cycle of its own.
    expect(syncNow).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('keeps deferring while an outer cycle outlives an inner one that started later', async () => {
    vi.useFakeTimers();
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await setGoals([goalFactory.build({ id: 'g1' })]);

    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = device.apiClient.getChanges.bind(device.apiClient);
    let calls = 0;
    vi.spyOn(device.apiClient, 'getChanges').mockImplementation(async (since: number) => {
      calls += 1;
      if (calls === 1) {
        await gate;
      }
      return original(since);
    });
    const syncNow = vi.spyOn(device.engine, 'syncNow');

    const outer = device.engine.syncNow();
    // Starts second, finishes first — a boolean flag would report "no cycle in flight" here.
    await device.engine.syncNow();
    await device.engine.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(syncNow).toHaveBeenCalledTimes(2);

    release();
    await outer;
    await vi.advanceTimersByTimeAsync(2_000);

    expect(syncNow).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('cancels a pending push when the account is disabled mid-debounce', async () => {
    // dk is nulled by disableSync regardless, which would push nothing either way — spying on
    // syncNow, not the server, is what actually proves stop() cancelled the pending timer.
    vi.useFakeTimers();
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.markMutated('goals', 'g1');

    await device.engine.disableSync();
    const syncNow = vi.spyOn(device.engine, 'syncNow');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(syncNow).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not schedule a push for a mutation recorded after the account was disabled', async () => {
    vi.useFakeTimers();
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    await device.engine.enableSync('dev', 'cred-a', 'Device A');
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await device.engine.disableSync();
    const syncNow = vi.spyOn(device.engine, 'syncNow');

    await device.engine.markMutated('goals', 'g1');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(syncNow).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
