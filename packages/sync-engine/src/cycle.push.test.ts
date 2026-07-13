import { generateDataKey } from '@cuewise/crypto';
import { configurePlatform, hlcEncode } from '@cuewise/shared';
import { setGoals } from '@cuewise/storage';
import { goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeTransport } from './__fixtures__/fake-transport';
import { defaultBindings } from './collections';
import { type CycleDeps, pushOnce } from './cycle';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';
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

function makeDeps(kv: FakeKvStore, transport: FakeTransport): CycleDeps {
  return {
    transport,
    meta: new SyncMetadataStore(kv),
    bindings: defaultBindings(),
    dk: generateDataKey(),
    keyId: KEY_ID,
    strategy: new LwwHlcStrategy(),
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
});
