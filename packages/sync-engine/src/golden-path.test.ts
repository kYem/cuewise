import { configurePlatform } from '@cuewise/shared';
import { getGoals, getQuotes, setGoals, setQuotes } from '@cuewise/storage';
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

    await deviceA.engine.enableSync('devA-cred', 'Device A');

    expect(deviceA.engine.getStatus()).toBe('active');
    expect(deviceA.onRecoveryCode).toHaveBeenCalledTimes(1);
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    const aGoalsAfterEnable = await getGoals();
    const aQuotesAfterEnable = await getQuotes();

    // Device B: fresh device, enrolls with A's recovery code and pulls A's data down.
    const deviceB = createDevice(server, makeClock(5_000_000));
    useStorage(deviceB);

    await deviceB.engine.enableSync('devB-cred', 'Device B', recoveryCode);
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
  });
});

describe('swappability guard: ConflictStrategy is the only conflict decision point', () => {
  it('a NoopStrategy device never lets an incoming record overwrite its local value', async () => {
    const server = new FakeSyncServer();

    const deviceA = createDevice(server, makeClock(1_000_000));
    useStorage(deviceA);
    await setGoals([goalFactory.build({ id: 'g1', text: 'A original' })]);
    await deviceA.engine.enableSync('devA-cred', 'Device A');
    const recoveryCode = deviceA.onRecoveryCode.mock.calls[0][0] as string;

    // Device B seeds a conflicting local value for the same entity id, then enrolls with a
    // strategy that always keeps local — with real LWW this seed would be overwritten by A's.
    const deviceB = createDevice(server, makeClock(5_000_000), { strategy: new NoopStrategy() });
    useStorage(deviceB);
    await setGoals([goalFactory.build({ id: 'g1', text: 'B local — must never be overwritten' })]);

    await deviceB.engine.enableSync('devB-cred', 'Device B', recoveryCode);
    await deviceB.engine.syncNow();

    const bGoals = await getGoals();
    expect(bGoals.find((g) => g.id === 'g1')?.text).toBe('B local — must never be overwritten');
  });
});
