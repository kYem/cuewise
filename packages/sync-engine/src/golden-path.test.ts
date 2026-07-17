import { configurePlatform } from '@cuewise/shared';
import {
  getGoals,
  getQuotes,
  getSettings,
  setGoals,
  setQuotes,
  setSettings,
} from '@cuewise/storage';
import { SessionManager } from '@cuewise/sync-client';
import { goalFactory, quoteFactory } from '@cuewise/test-utils/factories';
import { describe, expect, it, vi } from 'vitest';
import { FakeApiClient, FakeSyncServer } from './__fixtures__/fake-api-client';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeScheduler } from './__fixtures__/fake-scheduler';
import { NoopStrategy } from './__fixtures__/noop-strategy';
import { type CollectionBinding, defaultBindings } from './collections';
import { SyncEngine, type SyncEngineDeps } from './engine';

interface Device {
  kv: FakeKvStore;
  apiClient: FakeApiClient;
  scheduler: FakeScheduler;
  engine: SyncEngine;
  onStatus: ReturnType<typeof vi.fn>;
  onRecoveryCode: ReturnType<typeof vi.fn>;
}

// Deterministic, strictly-increasing HLC input. Each device gets its own offset range so
// conflict outcomes are predictable without depending on wall-clock time or node-id tiebreaks.
function makeClock(start: number): () => number {
  let t = start;
  return () => {
    const value = t;
    t += 1;
    return value;
  };
}

/** One "device": its own storage/scheduler/session/clock, sharing the given fake server. */
function createDevice(
  server: FakeSyncServer,
  now: () => number,
  overrides: Partial<SyncEngineDeps> = {}
): Device {
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
    now,
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

function getBinding(name: string): CollectionBinding {
  const binding = defaultBindings().find((b) => b.name === name);
  if (binding === undefined) {
    throw new Error(`no binding named ${name}`);
  }
  return binding;
}

describe('golden path: two devices converge through one shared fake server', () => {
  it('backfills, propagates an edit, and resolves a concurrent edit deterministically', async () => {
    const server = new FakeSyncServer();

    // Device A: brand-new enable, seeded with a goal + a custom quote before enrolling, so
    // backfillDirty uploads them as part of enableSync.
    const deviceA = createDevice(server, makeClock(1_000_000));
    useStorage(deviceA);
    const seedGoal = goalFactory.build({ id: 'g1', text: 'Ship the golden path' });
    const seedQuote = quoteFactory.build({
      id: 'q1',
      isCustom: true,
      text: 'Write your own line.',
    });
    await setGoals([seedGoal]);
    await setQuotes([seedQuote]);

    await deviceA.engine.enableSync('dev', 'devA-cred', 'Device A');

    expect(deviceA.engine.getStatus()).toBe('active');
    expect(deviceA.onRecoveryCode).toHaveBeenCalledTimes(1);
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const aGoalsAfterEnable = await getGoals();
    const aQuotesAfterEnable = await getQuotes();

    // Device B: fresh device, enrolls with A's recovery code and pulls A's data down.
    const deviceB = createDevice(server, makeClock(5_000_000));
    useStorage(deviceB);

    await deviceB.engine.enableSync('dev', 'devB-cred', 'Device B', { recoveryCode });
    await deviceB.engine.syncNow();

    expect(deviceB.engine.getStatus()).toBe('active');
    const bGoalsAfterEnroll = await getGoals();
    const bQuotesAfterEnroll = await getQuotes();
    expect(bGoalsAfterEnroll).toEqual(aGoalsAfterEnable);
    expect(bQuotesAfterEnroll).toEqual(aQuotesAfterEnable);

    // B edits g1 and syncs; A syncs and must see B's edit (its HLC is newer).
    const goalsBinding = getBinding('goals');
    useStorage(deviceB);
    const bEditedGoal = { ...seedGoal, text: 'B edited this from Device B' };
    const bWrite = await goalsBinding.writeOne('g1', bEditedGoal);
    expect(bWrite.success).toBe(true);
    await deviceB.engine.markMutated('goals', 'g1');
    await deviceB.engine.syncNow();

    useStorage(deviceA);
    await deviceA.engine.syncNow();
    const aGoalsAfterBEdit = await getGoals();
    expect(aGoalsAfterBEdit.find((g) => g.id === 'g1')?.text).toBe(bEditedGoal.text);

    // Concurrent edit: A and B both edit g1 before either syncs again. Device B's clock offset
    // is always ahead of A's for this whole test, so B's edit must win on both sides.
    useStorage(deviceA);
    const aConcurrentGoal = { ...bEditedGoal, text: 'A concurrent edit' };
    await goalsBinding.writeOne('g1', aConcurrentGoal);
    await deviceA.engine.markMutated('goals', 'g1');

    useStorage(deviceB);
    const bConcurrentGoal = { ...bEditedGoal, text: 'B concurrent edit' };
    await goalsBinding.writeOne('g1', bConcurrentGoal);
    await deviceB.engine.markMutated('goals', 'g1');

    useStorage(deviceA);
    await deviceA.engine.syncNow(); // push A's concurrent edit
    useStorage(deviceB);
    await deviceB.engine.syncNow(); // pull A's edit (loses, lower HLC), push B's own
    useStorage(deviceA);
    await deviceA.engine.syncNow(); // pull B's edit (wins)

    useStorage(deviceA);
    const aFinalGoals = await getGoals();
    useStorage(deviceB);
    const bFinalGoals = await getGoals();
    expect(aFinalGoals.find((g) => g.id === 'g1')?.text).toBe('B concurrent edit');
    expect(bFinalGoals.find((g) => g.id === 'g1')?.text).toBe('B concurrent edit');
    expect(aFinalGoals).toEqual(bFinalGoals);

    // Delete propagation: A deletes g1, which both devices already hold. The tombstone must
    // reach B and binding.writeOne(id, null) must actually remove it from B's local storage.
    useStorage(deviceA);
    await goalsBinding.writeOne('g1', null);
    await deviceA.engine.markDeleted('goals', 'g1');
    await deviceA.engine.syncNow();

    useStorage(deviceB);
    await deviceB.engine.syncNow();
    const bGoalsAfterDelete = await getGoals();
    expect(bGoalsAfterDelete.find((g) => g.id === 'g1')).toBeUndefined();

    useStorage(deviceA);
    const aGoalsAfterDelete = await getGoals();
    expect(aGoalsAfterDelete.find((g) => g.id === 'g1')).toBeUndefined();
  });
});

describe('swappability guard: ConflictStrategy is the only conflict decision point', () => {
  /**
   * A's clock offset outranks B's for this whole scenario, so A's seed for g1 is PROVABLY
   * newer than B's local seed for g1 — a real LWW resolution must overwrite B's local value.
   * enableSync's own backfillDirty (stamps B's local hlc) + syncNow (pulls A's record) is the
   * exact conflict point this guard exists to exercise. Swapping in `strategyOverride` proves
   * the engine actually asks the strategy instead of hardcoding LWW.
   */
  async function runOverwriteScenario(
    strategyOverride?: Partial<SyncEngineDeps>
  ): Promise<string | undefined> {
    const server = new FakeSyncServer();

    const deviceA = createDevice(server, makeClock(5_000_000));
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1', text: 'A original' })]);
    await deviceA.engine.enableSync('dev', 'devA-cred', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server, makeClock(1_000_000), strategyOverride);
    useStorage(deviceB);
    await setGoals([goalFactory.build({ id: 'g1', text: 'B local — must never be overwritten' })]);
    await deviceB.engine.enableSync('dev', 'devB-cred', 'Device B', { recoveryCode });
    await deviceB.engine.syncNow();

    const bGoals = await getGoals();
    return bGoals.find((g) => g.id === 'g1')?.text;
  }

  it('proof: the default LwwHlcStrategy lets a provably newer incoming edit overwrite local', async () => {
    const text = await runOverwriteScenario();
    expect(text).toBe('A original');
  });

  it('a NoopStrategy device blocks that same provably newer incoming edit; local survives', async () => {
    const text = await runOverwriteScenario({ strategy: new NoopStrategy() });
    expect(text).toBe('B local — must never be overwritten');
  });
});

describe('settings: per-key sync round-trips a shared key but excludes device-local keys', () => {
  it('propagates a shared setting to the other device but never a device-local one', async () => {
    const server = new FakeSyncServer();

    // A enables first with the higher clock offset. The settings binding backfills every
    // non-device-local key from DEFAULT_SETTINGS on enable (even unset ones), so B (enrolling
    // second) needs a LOWER offset than A's already-pushed defaults — otherwise B's own backfill
    // would numerically outrank A's incoming records and B would never adopt (or clock-catch-up
    // to) anything A sends, including its later theme edit.
    const deviceA = createDevice(server, makeClock(5_000_000));
    useStorage(deviceA);
    await deviceA.engine.enableSync('dev', 'devA-cred', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const deviceB = createDevice(server, makeClock(1_000_000));
    useStorage(deviceB);
    await deviceB.engine.enableSync('dev', 'devB-cred', 'Device B', { recoveryCode });
    await deviceB.engine.syncNow();

    // A changes a shared setting and syncs; B must adopt the new value.
    useStorage(deviceA);
    const aSettings = await getSettings();
    await setSettings({ ...aSettings, theme: 'dark' });
    await deviceA.engine.markMutated('settings', 'theme');
    await deviceA.engine.syncNow();

    useStorage(deviceB);
    await deviceB.engine.syncNow();
    const bSettingsAfterThemeSync = await getSettings();
    expect(bSettingsAfterThemeSync.theme).toBe('dark');

    // A changes device-local settings; none of them must ever leave A's device.
    useStorage(deviceA);
    const aSettingsAfterTheme = await getSettings();
    await setSettings({
      ...aSettingsAfterTheme,
      logLevel: 'debug',
      focusedGoalId: 'g1',
      hasSeenOnboarding: true,
    });
    await deviceA.engine.markMutated('settings', 'logLevel');
    await deviceA.engine.markMutated('settings', 'focusedGoalId');
    await deviceA.engine.markMutated('settings', 'hasSeenOnboarding');
    await deviceA.engine.syncNow();

    useStorage(deviceB);
    await deviceB.engine.syncNow();
    const bSettingsAfterDeviceLocalSync = await getSettings();
    expect(bSettingsAfterDeviceLocalSync.logLevel).toBe('error');
    expect(bSettingsAfterDeviceLocalSync.focusedGoalId).toBe(null);
    expect(bSettingsAfterDeviceLocalSync.hasSeenOnboarding).toBe(false);
  });
});
