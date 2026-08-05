import { generateDataKey } from '@cuewise/crypto';
import { configurePlatform, hlcEncode, logger } from '@cuewise/shared';
import { setGoals } from '@cuewise/storage';
import { goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeTransport } from './__fixtures__/fake-transport';
import { defaultBindings } from './collections';
import { type CycleDeps, pushOnce } from './cycle';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';
import { MutationTracker } from './mutation-tracker';
import { LwwHlcStrategy } from './strategy';

const KEY_ID = 'dk-1';
const HLC = hlcEncode({ physical: 1_700_000_000_000, counter: 1, node: 'device-a' });

/** Stamps entityIds dirty for a collection with a fixed hlc, bypassing MutationTracker. */
async function seedDirty(
  metaStore: SyncMetadataStore,
  collection: string,
  entityIds: string[]
): Promise<SyncMeta> {
  const meta = await metaStore.load();
  meta.dirty[collection] = entityIds;
  for (const entityId of entityIds) {
    meta.hlcs[SyncMetadataStore.entityKey(collection, entityId)] = HLC;
  }
  await metaStore.save(meta);
  return meta;
}

/** Runs `landing` inside the push's round trip — after the server acked, before the ledger write. */
function duringPush(transport: FakeTransport, landing: () => Promise<void>): void {
  const pushChanges = transport.pushChanges.bind(transport);
  vi.spyOn(transport, 'pushChanges').mockImplementation(async (records) => {
    const ack = await pushChanges(records);
    await landing();
    return ack;
  });
}

function makeDeps(
  kv: FakeKvStore,
  transport: FakeTransport,
  overrides: Partial<CycleDeps> = {}
): CycleDeps {
  return {
    transport,
    meta: new SyncMetadataStore(kv),
    bindings: defaultBindings(),
    dk: generateDataKey(),
    keyId: KEY_ID,
    strategy: new LwwHlcStrategy(),
    isCancelled: () => false,
    ...overrides,
  };
}

describe('pushOnce', () => {
  let kv: FakeKvStore;
  let transport: FakeTransport;

  beforeEach(() => {
    kv = new FakeKvStore();
    transport = new FakeTransport();
    configurePlatform({ storage: kv });
  });

  it('pushes a non-deleted record for a dirty entity present in storage, then clears dirty', async () => {
    const g1 = goalFactory.build({ id: 'g1' });
    await setGoals([g1]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const deps = makeDeps(kv, transport);

    await pushOnce(deps);

    expect(transport.pushedBatches).toHaveLength(1);
    expect(transport.pushedBatches[0]).toHaveLength(1);
    expect(transport.pushedBatches[0][0].collection).toBe('goals');
    expect(transport.pushedBatches[0][0].entityId).toBe('g1');
    expect(transport.pushedBatches[0][0].deleted).toBe(false);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
  });

  it('pushes a deleted:true record for a dirty id absent from storage', async () => {
    await setGoals([]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g-missing']);
    const deps = makeDeps(kv, transport);

    await pushOnce(deps);

    expect(transport.pushedBatches[0][0].deleted).toBe(true);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
  });

  it('chunks more than 100 dirty ids into multiple batches of at most 100', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `g${i}`);
    const goals = ids.map((id) => goalFactory.build({ id }));
    await setGoals(goals);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ids);
    const deps = makeDeps(kv, transport);

    await pushOnce(deps);

    expect(transport.pushedBatches.length).toBeGreaterThanOrEqual(2);
    for (const batch of transport.pushedBatches) {
      expect(batch.length).toBeLessThanOrEqual(100);
    }
    const total = transport.pushedBatches.reduce((sum, batch) => sum + batch.length, 0);
    expect(total).toBe(150);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
  });

  it('skips a device-local settings key that snuck into dirty, pushing only the synced one', async () => {
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'settings', ['theme', 'cloudSyncEnabled']);
    const deps = makeDeps(kv, transport);

    await pushOnce(deps);

    expect(transport.pushedBatches).toHaveLength(1);
    const pushedIds = transport.pushedBatches[0].map((record) => record.entityId);
    expect(pushedIds).toContain('theme');
    expect(pushedIds).not.toContain('cloudSyncEnabled');
  });

  // The read decides deleted:true for every dirty id, so an unreadable collection must stop the
  // push rather than seal each of them as a tombstone for every other device.
  it('pushes nothing and keeps dirty when the collection cannot be read', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const deps = makeDeps(kv, transport);
    kv.failGetManyForKey = 'goals';

    await expect(pushOnce(deps)).rejects.toThrow();

    expect(transport.pushedBatches).toEqual([]);
    kv.failGetManyForKey = null;
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1']);
  });

  it('pushes nothing when the cycle is already cancelled', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const deps = makeDeps(kv, transport, { isCancelled: () => true });

    const result = await pushOnce(deps);

    expect(result).toEqual({ kind: 'cancelled' });
    expect(transport.pushedBatches).toEqual([]);
  });

  it('stops between batches once cancelled, without writing the ack back to the ledger', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `g${i}`);
    await setGoals(ids.map((id) => goalFactory.build({ id })));
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ids);
    const deps = makeDeps(kv, transport, {
      isCancelled: () => transport.pushedBatches.length > 0,
    });

    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await pushOnce(deps);

    expect(result).toEqual({ kind: 'cancelled' });
    expect(transport.pushedBatches).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync stopped a push for a disconnected account, but its server had already accepted 100 records'
    );
    errorSpy.mockRestore();
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(ids);
  });

  it('leaves meta.dirty intact when pushChanges rejects', async () => {
    const g1 = goalFactory.build({ id: 'g1' });
    await setGoals([g1]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    transport.rejectPush = true;
    const deps = makeDeps(kv, transport);

    await expect(pushOnce(deps)).rejects.toThrow();

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1']);
  });

  it('keeps an edit marked dirty while the batch was in flight, clearing only what it sent', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const tracker = new MutationTracker(metaStore, () => 1000);
    duringPush(transport, () => tracker.markMutated('quotes', 'q1'));

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.dirty.quotes).toEqual(['q1']);
  });

  // The ack speaks for the version it sent, so an id edited again mid-flight must stay dirty —
  // otherwise that edit never leaves the device until the same entity is touched again.
  it('keeps an id dirty when it was re-edited while its own batch was in flight', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const tracker = new MutationTracker(metaStore, () => 1000);
    duringPush(transport, () => tracker.markMutated('goals', 'g1'));

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1']);
  });

  it('keeps a tombstone a delete re-marked while its own batch was in flight', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const tracker = new MutationTracker(metaStore, () => 1000);
    duringPush(transport, () => tracker.markDeleted('goals', 'g1'));

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const saved = await metaStore.load();
    expect(saved.tombstones).toContain('goals/g1');
  });

  // The only trace of what a healthy cycle moved: nothing else logs on the success path.
  it('summarises what it pushed, by collection and without entity ids', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const g1 = goalFactory.build({ id: 'g1' });
    const g2 = goalFactory.build({ id: 'g2' });
    await setGoals([g1, g2]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1', 'g2']);

    await pushOnce(makeDeps(kv, transport));

    expect(debugSpy).toHaveBeenCalledWith('Sync push sent 2 record(s)', {
      byCollection: { goals: 2 },
    });
    const logged = JSON.stringify(debugSpy.mock.calls);
    expect(logged).not.toContain('g1');
  });
});
