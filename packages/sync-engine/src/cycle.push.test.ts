import { generateDataKey } from '@cuewise/crypto';
import { configurePlatform, hlcEncode, logger, storageFailure } from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import { goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disableAfterFirstWrite, requireBinding } from './__fixtures__/bindings';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeTransport } from './__fixtures__/fake-transport';
import { sealServerRecord } from './__fixtures__/records';
import { defaultBindings } from './collections';
import { type CycleDeps, pushOnce } from './cycle';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';
import { MutationTracker } from './mutation-tracker';
import { LwwHlcStrategy, type RecordBody } from './strategy';

const KEY_ID = 'dk-1';
const HLC = hlcEncode({ physical: 1_700_000_000_000, counter: 1, node: 'device-a' });
const OLDER_HLC = hlcEncode({ physical: 1_600_000_000_000, counter: 1, node: 'device-b' });
const NEWER_HLC = hlcEncode({ physical: 1_800_000_000_000, counter: 1, node: 'device-b' });

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

  it('sends the seq it last saw as baseSeq, and 0 for an entity it never saw a seq for', async () => {
    await setGoals([goalFactory.build({ id: 'g1' }), goalFactory.build({ id: 'g2' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1', 'g2']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 4;
    });

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const [batch] = transport.pushedBatches;
    expect(batch.find((r) => r.entityId === 'g1')?.baseSeq).toBe(4);
    expect(batch.find((r) => r.entityId === 'g2')?.baseSeq).toBe(0);
  });

  it('settles, rather than overwrites, a row another device created for an id this one never saw', async () => {
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const theirs = goalFactory.build({ id: 'g1', text: 'theirs' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: theirs, hlc: NEWER_HLC },
        1
      )
    );

    await pushOnce(deps);

    expect(transport.serverRecords.get('goals/g1')?.seq).toBe(1);
    expect(await getGoals()).toEqual([theirs]);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.seqs['goals/g1']).toBe(1);
  });

  it('records the seq the server assigned to each applied record', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const saved = await metaStore.load();
    expect(saved.seqs['goals/g1']).toBe(1);
    expect(saved.dirty.goals).toBeUndefined();
  });

  it('records the applied seq even when the id was re-edited during the round trip, and keeps it dirty', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const tracker = new MutationTracker(metaStore, () => 1000);
    duringPush(transport, () => tracker.markMutated('goals', 'g1'));

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1']);
    expect(saved.seqs['goals/g1']).toBe(1);
  });

  it('clears dirty and learns nothing about seqs from a server that predates compare-and-set', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    transport.legacyPushResponse = true;

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.seqs['goals/g1']).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('takes the server seq of a refused record when it is below the one held, so the retry can land', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const mine = goalFactory.build({ id: 'g1', text: 'mine' });
    await setGoals([mine]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 50;
    });
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const stale = goalFactory.build({ id: 'g1', text: 'stale' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: stale, hlc: OLDER_HLC },
        3
      )
    );

    await pushOnce(deps);

    expect(transport.pushedBatches.map((batch) => batch[0].baseSeq)).toEqual([50, 3]);
    expect(warnSpy).toHaveBeenCalledWith(
      "Server seq for a refused record is below the one held; taking the server's",
      { key: 'goals/g1', held: 50, seq: 3 }
    );
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.seqs['goals/g1']).toBe(transport.serverRecords.get('goals/g1')?.seq);
    expect(saved.seqs['goals/g1']).toBeGreaterThan(3);
    warnSpy.mockRestore();
  });

  it('applies the server version and clears dirty when a conflict shows the server is newer', async () => {
    const mine = goalFactory.build({ id: 'g1', text: 'mine' });
    await setGoals([mine]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
    });
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const theirs = goalFactory.build({ id: 'g1', text: 'theirs' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: theirs, hlc: NEWER_HLC },
        2
      )
    );

    await pushOnce(deps);

    expect(await getGoals()).toEqual([theirs]);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
    expect(saved.seqs['goals/g1']).toBe(2);
    expect(transport.pushedBatches).toHaveLength(1);
  });

  it('re-pushes with the fresh base in the same call when a conflict shows the server is older', async () => {
    const mine = goalFactory.build({ id: 'g1', text: 'mine' });
    await setGoals([mine]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
    });
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const stale = goalFactory.build({ id: 'g1', text: 'stale' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: stale, hlc: OLDER_HLC },
        2
      )
    );

    await pushOnce(deps);

    expect(transport.pushedBatches).toHaveLength(2);
    expect(transport.pushedBatches[1][0]).toMatchObject({ entityId: 'g1', baseSeq: 2 });
    const landed = transport.serverRecords.get('goals/g1')?.seq;
    expect(landed).toBeGreaterThan(2);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.seqs['goals/g1']).toBe(landed);
    expect(await getGoals()).toEqual([mine]);
  });

  it('clears dirty without writing when a conflict shows the server already holds this version', async () => {
    const mine = goalFactory.build({ id: 'g1', text: 'mine' });
    await setGoals([mine]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
    });
    const bindings = defaultBindings();
    const writeOneSpy = vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne');
    const deps = makeDeps(kv, transport, { meta: metaStore, bindings });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(deps.dk, deps.keyId, 'goals', 'g1', { entity: mine, hlc: HLC }, 2)
    );

    await pushOnce(deps);

    expect(transport.pushedBatches).toHaveLength(1);
    expect(writeOneSpy).not.toHaveBeenCalled();
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.seqs['goals/g1']).toBe(2);
  });

  it('keeps an id dirty through a conflict it lost when the user re-edited it during the round trip', async () => {
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
    });
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const theirs = goalFactory.build({ id: 'g1', text: 'theirs' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: theirs, hlc: NEWER_HLC },
        2
      )
    );
    // Stamped above the sealed hlc but below the server's, so the conflict is genuinely lost.
    const tracker = new MutationTracker(metaStore, () => 1_750_000_000_000);
    duringPush(transport, () => tracker.markMutated('goals', 'g1'));

    await pushOnce(deps);

    expect(await getGoals()).toEqual([theirs]);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1']);
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
    expect(saved.seqs['goals/g1']).toBe(2);
  });

  it('quarantines an undecryptable conflict, records its seq, and lands the retry over it', async () => {
    const mine = goalFactory.build({ id: 'g1', text: 'mine' });
    await setGoals([mine]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
    });
    const onQuarantine = vi.fn();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const deps = makeDeps(kv, transport, { meta: metaStore, onQuarantine });
    const sealed = await sealServerRecord(
      deps.dk,
      deps.keyId,
      'goals',
      'g1',
      { entity: mine, hlc: OLDER_HLC },
      2
    );
    transport.serverRecords.set('goals/g1', { ...sealed, ciphertext: 'garbage' });

    await pushOnce(deps);

    expect(onQuarantine).toHaveBeenCalledWith('goals/g1');
    expect(transport.pushedBatches).toHaveLength(2);
    expect(transport.pushedBatches[1][0].baseSeq).toBe(2);
    expect(transport.serverRecords.get('goals/g1')?.ciphertext).not.toBe('garbage');
    expect(warnSpy).toHaveBeenCalledWith(
      'Re-pushing the local version over a server row this device cannot read',
      { collection: 'goals', entityId: 'g1', seq: 2 }
    );
    const saved = await metaStore.load();
    expect(saved.quarantine).toEqual(['goals/g1']);
    expect(saved.dirty.goals).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('rejects, naming the record, when the server version of a conflict cannot be written locally', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
    });
    const bindings = defaultBindings();
    vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
      storageFailure('quota exceeded')
    );
    const deps = makeDeps(kv, transport, { meta: metaStore, bindings });
    const theirs = goalFactory.build({ id: 'g1', text: 'theirs' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: theirs, hlc: NEWER_HLC },
        2
      )
    );

    await expect(pushOnce(deps)).rejects.toThrow(
      "sync push stalled applying the server's version of goals/g1"
    );

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1']);
    expect(saved.hlcs['goals/g1']).toBe(HLC);
    // Not 2: a seq this device could not act on must not become the next push's base.
    expect(saved.seqs['goals/g1']).toBe(1);
    errorSpy.mockRestore();
  });

  it('keeps the conflicts settled before a failed write, leaving only the stalled one dirty', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await setGoals([
      goalFactory.build({ id: 'g1', text: 'mine 1' }),
      goalFactory.build({ id: 'g2', text: 'mine 2' }),
    ]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1', 'g2']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
      meta.seqs['goals/g2'] = 2;
    });
    const bindings = defaultBindings();
    const goals = requireBinding(bindings, 'goals');
    const write = goals.writeOne.bind(goals);
    vi.spyOn(goals, 'writeOne').mockImplementation(async (entityId, entity) => {
      if (entityId === 'g2') {
        return storageFailure('quota exceeded');
      }
      return write(entityId, entity);
    });
    const deps = makeDeps(kv, transport, { meta: metaStore, bindings });
    const theirs1 = goalFactory.build({ id: 'g1', text: 'theirs 1' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: theirs1, hlc: NEWER_HLC },
        3
      )
    );
    transport.serverRecords.set(
      'goals/g2',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g2',
        { entity: null, hlc: NEWER_HLC },
        4
      )
    );

    await expect(pushOnce(deps)).rejects.toThrow(
      "sync push stalled applying the server's version of goals/g2"
    );

    expect((await getGoals()).find((g) => g.id === 'g1')).toEqual(theirs1);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g2']);
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
    expect(saved.seqs['goals/g1']).toBe(3);
    expect(saved.seqs['goals/g2']).toBe(2);
    errorSpy.mockRestore();
  });

  it('stops mid-settle once a disable lands, leaving later conflicts unapplied and the ledger untouched', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const mine2 = goalFactory.build({ id: 'g2', text: 'mine 2' });
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine 1' }), mine2]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1', 'g2']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
      meta.seqs['goals/g2'] = 2;
    });
    const bindings = defaultBindings();
    const { isCancelled } = disableAfterFirstWrite(requireBinding(bindings, 'goals'));
    const deps = makeDeps(kv, transport, { meta: metaStore, bindings, isCancelled });
    const theirs1 = goalFactory.build({ id: 'g1', text: 'theirs 1' });
    const theirs2 = goalFactory.build({ id: 'g2', text: 'theirs 2' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: theirs1, hlc: NEWER_HLC },
        3
      )
    );
    transport.serverRecords.set(
      'goals/g2',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g2',
        { entity: theirs2, hlc: NEWER_HLC },
        4
      )
    );

    const result = await pushOnce(deps);

    expect(result).toEqual({ kind: 'cancelled' });
    expect(await getGoals()).toEqual([theirs1, mine2]);
    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync stopped a push for a disconnected account; 1 server versions of its refused records had already been applied to this device'
    );
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1', 'g2']);
    expect(saved.hlcs['goals/g1']).toBe(HLC);
    expect(saved.hlcs['goals/g2']).toBe(HLC);
    expect(saved.seqs['goals/g1']).toBe(1);
    expect(saved.seqs['goals/g2']).toBe(2);
    errorSpy.mockRestore();
  });

  it('settles a record the server lists as both applied and refused as a refusal, and says so', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const theirs = goalFactory.build({ id: 'g1', text: 'theirs' });
    const current = await sealServerRecord(
      deps.dk,
      deps.keyId,
      'goals',
      'g1',
      { entity: theirs, hlc: NEWER_HLC },
      2
    );
    vi.spyOn(transport, 'pushChanges').mockResolvedValue({
      cursor: 3,
      applied: [{ collection: 'goals', entityId: 'g1', seq: 3 }],
      conflicts: [current],
    });

    await pushOnce(deps);

    expect(await getGoals()).toEqual([theirs]);
    expect(warnSpy).toHaveBeenCalledWith(
      'Push record both applied and refused; settling it as refused',
      { collection: 'goals', entityId: 'g1' }
    );
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
    // The conflict's seq, not the ack's: a record settled as refused takes nothing from `applied`.
    expect(saved.seqs['goals/g1']).toBe(2);
    warnSpy.mockRestore();
  });

  it('resurrects a tombstone this device pushed when the conflict shows a newer edit elsewhere', async () => {
    await setGoals([]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.tombstones.push('goals/g1');
      meta.seqs['goals/g1'] = 1;
    });
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const theirs = goalFactory.build({ id: 'g1', text: 'edited elsewhere' });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g1',
        { entity: theirs, hlc: NEWER_HLC },
        2
      )
    );

    await pushOnce(deps);

    expect(transport.pushedBatches[0][0].deleted).toBe(true);
    expect(await getGoals()).toEqual([theirs]);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.tombstones).not.toContain('goals/g1');
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
  });

  it('prunes the tombstone entry when a conflict shows the server already holds this delete', async () => {
    await setGoals([]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.tombstones.push('goals/g1');
      meta.seqs['goals/g1'] = 1;
    });
    const deps = makeDeps(kv, transport, { meta: metaStore });
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(deps.dk, deps.keyId, 'goals', 'g1', { entity: null, hlc: HLC }, 2)
    );

    await pushOnce(deps);

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.tombstones).not.toContain('goals/g1');
  });

  it('keeps a record pending and says so when the server lists it as neither applied nor refused', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    vi.spyOn(transport, 'pushChanges').mockResolvedValue({
      cursor: 1,
      applied: [],
      conflicts: [],
    });

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1']);
    expect(warnSpy).toHaveBeenCalledWith(
      'Push record neither applied nor refused; keeping it pending',
      { collection: 'goals', entityId: 'g1' }
    );
    warnSpy.mockRestore();
  });

  it('retries a conflict at most once per call, leaving a still-moving row for the next cycle', async () => {
    const mine = goalFactory.build({ id: 'g1', text: 'mine' });
    await setGoals([mine]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 1;
    });
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const stale: RecordBody = {
      entity: goalFactory.build({ id: 'g1', text: 'stale' }),
      hlc: OLDER_HLC,
    };
    transport.serverRecords.set(
      'goals/g1',
      await sealServerRecord(deps.dk, deps.keyId, 'goals', 'g1', stale, 2)
    );
    // Another writer moves the row again between our first push and the retry.
    const pushChanges = transport.pushChanges.bind(transport);
    let calls = 0;
    vi.spyOn(transport, 'pushChanges').mockImplementation(async (records) => {
      calls += 1;
      if (calls === 2) {
        transport.serverRecords.set(
          'goals/g1',
          await sealServerRecord(deps.dk, deps.keyId, 'goals', 'g1', stale, 9)
        );
      }
      return pushChanges(records);
    });

    await pushOnce(deps);

    expect(calls).toBe(2);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g1']);
    expect(saved.seqs['goals/g1']).toBe(9);
  });

  it('still pushes the later batches when a conflict in an earlier one stalls, then rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const ids = Array.from({ length: 101 }, (_, i) => `g${i}`);
    await setGoals(ids.map((id) => goalFactory.build({ id, text: 'mine' })));
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ids);
    await metaStore.update((meta) => {
      meta.seqs['goals/g0'] = 1;
    });
    const bindings = defaultBindings();
    vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
      storageFailure('quota exceeded')
    );
    const deps = makeDeps(kv, transport, { meta: metaStore, bindings });
    const theirs = goalFactory.build({ id: 'g0', text: 'theirs' });
    transport.serverRecords.set(
      'goals/g0',
      await sealServerRecord(
        deps.dk,
        deps.keyId,
        'goals',
        'g0',
        { entity: theirs, hlc: NEWER_HLC },
        2
      )
    );

    await expect(pushOnce(deps)).rejects.toThrow(
      "sync push stalled applying the server's version of goals/g0"
    );

    expect(transport.pushedBatches).toHaveLength(2);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g0']);
    errorSpy.mockRestore();
  });

  it('ignores, and says so, records in the reply that this batch never sent', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    const deps = makeDeps(kv, transport, { meta: metaStore });
    const stray = goalFactory.build({ id: 'g9', text: 'nobody asked' });
    const strayRow = await sealServerRecord(
      deps.dk,
      deps.keyId,
      'goals',
      'g9',
      { entity: stray, hlc: NEWER_HLC },
      7
    );
    vi.spyOn(transport, 'pushChanges').mockResolvedValue({
      cursor: 8,
      applied: [
        { collection: 'goals', entityId: 'g1', seq: 8 },
        { collection: 'goals', entityId: 'g8', seq: 6 },
      ],
      conflicts: [strayRow],
    });

    await pushOnce(deps);

    expect((await getGoals()).map((g) => g.id)).toEqual(['g1']);
    expect(warnSpy).toHaveBeenCalledWith(
      'Push reply named records this batch did not send; ignoring them',
      { applied: 1, conflicts: 1 }
    );
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.seqs).toEqual({ 'goals/g1': 8 });
    warnSpy.mockRestore();
  });

  it('records no seq from an applied record whose seq is not a seq, and says so', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    await setGoals([goalFactory.build({ id: 'g1' })]);
    const metaStore = new SyncMetadataStore(kv);
    await seedDirty(metaStore, 'goals', ['g1']);
    vi.spyOn(transport, 'pushChanges').mockResolvedValue({
      cursor: 2,
      applied: [{ collection: 'goals', entityId: 'g1', seq: 1.5 }],
      conflicts: [],
    });

    await pushOnce(makeDeps(kv, transport, { meta: metaStore }));

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.seqs['goals/g1']).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('Ignoring an applied record whose seq is not a seq', {
      collection: 'goals',
      entityId: 'g1',
      seq: 1.5,
    });
    warnSpy.mockRestore();
  });
});
