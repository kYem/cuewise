import { generateDataKey, sealRecord as sealCiphertext } from '@cuewise/crypto';
import {
  configurePlatform,
  hlcEncode,
  logger,
  type SyncRecord,
  storageFailure,
} from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import { ApiError } from '@cuewise/sync-client';
import { goalFactory, quoteFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableAfterFirstWrite,
  failReadsAfterFirst,
  requireBinding,
} from './__fixtures__/bindings';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeTransport } from './__fixtures__/fake-transport';
import { sealServerRecord } from './__fixtures__/records';
import { defaultBindings } from './collections';
import { type CycleDeps, PULL_PAGE, pullOnce } from './cycle';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';
import { MutationTracker } from './mutation-tracker';
import { LwwHlcStrategy, type RecordBody } from './strategy';

const KEY_ID = 'dk-1';
const OLDER_HLC = hlcEncode({ physical: 1_700_000_000_000, counter: 1, node: 'device-a' });
const NEWER_HLC = hlcEncode({ physical: 1_700_000_001_000, counter: 1, node: 'device-a' });
/** Wall clock for a local edit that must outrank anything the pull is carrying. */
const AHEAD_OF_PULL_MS = 1_800_000_000_000;

/** Runs `landing` inside the pull's round trip — after it loaded the ledger, before it saves. */
function duringPull(transport: FakeTransport, landing: () => Promise<void>): void {
  const getChanges = transport.getChanges.bind(transport);
  vi.spyOn(transport, 'getChanges').mockImplementation(async (since: number) => {
    const page = await getChanges(since);
    await landing();
    return page;
  });
}

/** Marks an entity as known-local at a given hlc, bypassing a real pull/push round trip. */
async function seedLocalHlc(
  metaStore: SyncMetadataStore,
  collection: string,
  entityId: string,
  hlc: string
): Promise<SyncMeta> {
  const meta = await metaStore.load();
  meta.hlcs[SyncMetadataStore.entityKey(collection, entityId)] = hlc;
  await metaStore.save(meta);
  return meta;
}

/** Marks an entity as synced earlier: known at OLDER_HLC, and held by the server at `seq`. */
async function seedSynced(
  metaStore: SyncMetadataStore,
  collection: string,
  entityId: string,
  seq: number
): Promise<void> {
  const meta = await seedLocalHlc(metaStore, collection, entityId, OLDER_HLC);
  meta.seqs[SyncMetadataStore.entityKey(collection, entityId)] = seq;
  await metaStore.save(meta);
}

describe('pullOnce', () => {
  let kv: FakeKvStore;
  let transport: FakeTransport;
  let dk: ReturnType<typeof generateDataKey>;
  let metaStore: SyncMetadataStore;

  beforeEach(() => {
    kv = new FakeKvStore();
    transport = new FakeTransport();
    dk = generateDataKey();
    metaStore = new SyncMetadataStore(kv);
    configurePlatform({ storage: kv });
  });

  /** `count` sealed quote tombstones at seqs 1..count, for tests about paging alone. */
  function quoteTombstones(count: number): Promise<SyncRecord[]> {
    return Promise.all(
      Array.from({ length: count }, (_, i) =>
        sealServerRecord(dk, KEY_ID, 'quotes', `q${i}`, { entity: null, hlc: OLDER_HLC }, i + 1)
      )
    );
  }

  function makeDeps(overrides: Partial<CycleDeps> = {}): CycleDeps {
    return {
      transport,
      meta: metaStore,
      bindings: defaultBindings(),
      dk,
      keyId: KEY_ID,
      strategy: new LwwHlcStrategy(),
      isCancelled: () => false,
      ...overrides,
    };
  }

  it('overwrites local with a newer incoming record, advances the cursor, updates hlcs', async () => {
    const local = goalFactory.build({ id: 'g1', text: 'local' });
    await setGoals([local]);
    await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    const incomingGoal = goalFactory.build({ id: 'g1', text: 'incoming' });
    const rec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: incomingGoal, hlc: NEWER_HLC },
      1
    );
    transport.pullRecords = [rec];

    await pullOnce(makeDeps());

    const goals = await getGoals();
    expect(goals).toEqual([incomingGoal]);
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(1);
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
    expect(saved.seqs['goals/g1']).toBe(1);
    expect(saved.dirty.goals).toBeUndefined();
  });

  it('keeps local when incoming is older, advances the cursor, and re-dirties the key so the push repairs the server', async () => {
    const local = goalFactory.build({ id: 'g1', text: 'local' });
    await setGoals([local]);
    await seedLocalHlc(metaStore, 'goals', 'g1', NEWER_HLC);
    const staleGoal = goalFactory.build({ id: 'g1', text: 'stale' });
    const rec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: staleGoal, hlc: OLDER_HLC },
      1
    );
    transport.pullRecords = [rec];
    const bindings = defaultBindings();
    const writeOneSpy = vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne');

    await pullOnce(makeDeps({ bindings }));

    expect(writeOneSpy).not.toHaveBeenCalled();
    const goals = await getGoals();
    expect(goals).toEqual([local]);
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(1);
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
    expect(saved.dirty.goals).toEqual(['g1']);
    expect(saved.seqs['goals/g1']).toBe(1);
  });

  it('does not list a key twice when the local winner was already dirty', async () => {
    await setGoals([goalFactory.build({ id: 'g1', text: 'local' })]);
    await seedLocalHlc(metaStore, 'goals', 'g1', NEWER_HLC);
    await metaStore.update((meta) => {
      meta.dirty.goals = ['g1'];
    });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: null, hlc: OLDER_HLC }, 1),
    ];

    await pullOnce(makeDeps());

    expect((await metaStore.load()).dirty.goals).toEqual(['g1']);
  });

  it('does not re-dirty an echo of its own push (identical hlc), but records its seq', async () => {
    const local = goalFactory.build({ id: 'g1', text: 'mine' });
    await setGoals([local]);
    await seedLocalHlc(metaStore, 'goals', 'g1', NEWER_HLC);
    const echo = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: local, hlc: NEWER_HLC },
      3
    );
    transport.pullRecords = [echo];

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.seqs['goals/g1']).toBe(3);
    expect(saved.cursor).toBe(3);
  });

  it('re-dirties on equal physical time when the local counter is higher', async () => {
    const localHlc = hlcEncode({ physical: 1_700_000_000_000, counter: 2, node: 'device-a' });
    const incomingHlc = hlcEncode({ physical: 1_700_000_000_000, counter: 1, node: 'device-b' });
    const local = goalFactory.build({ id: 'g1', text: 'mine' });
    await setGoals([local]);
    await seedLocalHlc(metaStore, 'goals', 'g1', localHlc);
    transport.pullRecords = [
      await sealServerRecord(
        dk,
        KEY_ID,
        'goals',
        'g1',
        { entity: { ...local, text: 'theirs' }, hlc: incomingHlc },
        1
      ),
    ];

    await pullOnce(makeDeps());

    expect((await metaStore.load()).dirty.goals).toEqual(['g1']);
    expect(await getGoals()).toEqual([local]);
  });

  it('keeps the seq the pull saw even when an edit stamped the key during the round trip', async () => {
    const local = goalFactory.build({ id: 'g1', text: 'local' });
    await setGoals([local]);
    await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    const incoming = goalFactory.build({ id: 'g1', text: 'incoming' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: incoming, hlc: NEWER_HLC }, 7),
    ];
    const tracker = new MutationTracker(metaStore, () => AHEAD_OF_PULL_MS);
    duringPull(transport, () => tracker.markMutated('goals', 'g1'));

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.seqs['goals/g1']).toBe(7);
    expect(saved.hlcs['goals/g1']).not.toBe(NEWER_HLC);
    expect(saved.dirty.goals).toEqual(['g1']);
  });

  it('never lowers a seq the ledger already holds', async () => {
    await metaStore.update((meta) => {
      meta.seqs['goals/g1'] = 9;
    });
    const goal = goalFactory.build({ id: 'g1' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: goal, hlc: NEWER_HLC }, 2),
    ];

    await pullOnce(makeDeps());

    expect((await metaStore.load()).seqs['goals/g1']).toBe(9);
  });

  it('records the seq of a quarantined record too', async () => {
    const goal = goalFactory.build({ id: 'g1' });
    const rec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: goal, hlc: NEWER_HLC },
      4
    );
    transport.pullRecords = [{ ...rec, ciphertext: 'garbage' }];

    await pullOnce(makeDeps());

    expect((await metaStore.load()).seqs['goals/g1']).toBe(4);
  });

  it('quarantines a poison record, skips the write, fires onQuarantine once, and still advances the cursor', async () => {
    const goal = goalFactory.build({ id: 'g1' });
    const rec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: goal, hlc: NEWER_HLC },
      1
    );
    const poisoned: SyncRecord = { ...rec, ciphertext: 'garbage' };
    transport.pullRecords = [poisoned];
    const onQuarantine = vi.fn();

    await pullOnce(makeDeps({ onQuarantine }));

    const saved = await metaStore.load();
    expect(saved.quarantine).toEqual(['goals/g1']);
    expect(saved.cursor).toBe(1);
    expect(onQuarantine).toHaveBeenCalledTimes(1);
    expect(onQuarantine).toHaveBeenCalledWith('goals/g1');
    const goals = await getGoals();
    expect(goals).toEqual([]);
  });

  it('quarantines a malformed-JSON payload (valid ciphertext, garbage plaintext), skips the write, fires onQuarantine once, and still advances the cursor', async () => {
    const ciphertext = await sealCiphertext(dk, KEY_ID, 'goals', 'g1', 'not-json{{{');
    const malformed: SyncRecord = {
      collection: 'goals',
      entityId: 'g1',
      ciphertext,
      clientUpdatedAt: 0,
      deleted: false,
      seq: 1,
    };
    transport.pullRecords = [malformed];
    const onQuarantine = vi.fn();

    await pullOnce(makeDeps({ onQuarantine }));

    const saved = await metaStore.load();
    expect(saved.quarantine).toEqual(['goals/g1']);
    expect(saved.cursor).toBe(1);
    expect(onQuarantine).toHaveBeenCalledTimes(1);
    expect(onQuarantine).toHaveBeenCalledWith('goals/g1');
    const goals = await getGoals();
    expect(goals).toEqual([]);
  });

  it('stops before advancing the cursor when a write fails, so the record retries next cycle', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const goal = goalFactory.build({ id: 'g1' });
    const rec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: goal, hlc: NEWER_HLC },
      1
    );
    transport.pullRecords = [rec];
    const bindings = defaultBindings();
    vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
      storageFailure('quota exceeded')
    );

    const result = await pullOnce(makeDeps({ bindings }));

    // Reported as stopped-early, naming the record: a completed-pull result here is what let a
    // permanently wedged device report `synced` and stamp "Last synced just now".
    expect(result).toEqual({ kind: 'stalled', collection: 'goals', entityId: 'g1' });
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(0);
    expect(saved.hlcs['goals/g1']).toBeUndefined();
    // The stall must be diagnosable: the log names the record and the error.
    expect(errorSpy).toHaveBeenCalledWith(
      'Sync write failed applying a server record; it stays pending',
      expect.objectContaining({
        collection: 'goals',
        entityId: 'g1',
        seq: 1,
        error: expect.objectContaining({ message: 'quota exceeded' }),
      })
    );
    errorSpy.mockRestore();
  });

  it('records no seq for a record it could not write, so the push cannot land over it', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine' })]);
    await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    await metaStore.update((meta) => {
      meta.dirty.goals = ['g1'];
      meta.seqs['goals/g1'] = 2;
    });
    const theirs = goalFactory.build({ id: 'g1', text: 'theirs' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: theirs, hlc: NEWER_HLC }, 5),
    ];
    const bindings = defaultBindings();
    vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
      storageFailure('quota exceeded')
    );

    const result = await pullOnce(makeDeps({ bindings }));

    expect(result).toEqual({ kind: 'stalled', collection: 'goals', entityId: 'g1' });
    const saved = await metaStore.load();
    expect(saved.seqs['goals/g1']).toBe(2);
    expect(saved.cursor).toBe(0);
    expect(saved.dirty.goals).toEqual(['g1']);
    errorSpy.mockRestore();
  });

  it('keeps the seq it outranked and drops the repair mark when a later version of the same key cannot be written', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const between = hlcEncode({ physical: 1_700_000_000_500, counter: 1, node: 'device-a' });
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine' })]);
    await seedLocalHlc(metaStore, 'goals', 'g1', between);
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: null, hlc: OLDER_HLC }, 1),
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: null, hlc: NEWER_HLC }, 5),
    ];
    const bindings = defaultBindings();
    vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
      storageFailure('quota exceeded')
    );

    const result = await pullOnce(makeDeps({ bindings }));

    expect(result).toEqual({ kind: 'stalled', collection: 'goals', entityId: 'g1' });
    const saved = await metaStore.load();
    expect(saved.seqs['goals/g1']).toBe(1);
    expect(saved.cursor).toBe(1);
    expect(saved.dirty.goals).toBeUndefined();
    errorSpy.mockRestore();
  });

  it('keeps the cursor before a failed write on an incremental pull', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const meta = await metaStore.load();
    meta.cursor = 10;
    await metaStore.save(meta);
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'quotes', 'q1', { entity: null, hlc: NEWER_HLC }, 11),
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: null, hlc: NEWER_HLC }, 12),
    ];
    const bindings = defaultBindings();
    vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
      storageFailure('quota exceeded')
    );

    await pullOnce(makeDeps({ bindings }));

    expect((await metaStore.load()).cursor).toBe(11);
  });

  it('drops the repair mark once a later version of the same key applies over local', async () => {
    const between = hlcEncode({ physical: 1_700_000_000_500, counter: 1, node: 'device-a' });
    await setGoals([goalFactory.build({ id: 'g1', text: 'mine' })]);
    await seedLocalHlc(metaStore, 'goals', 'g1', between);
    const theirs = goalFactory.build({ id: 'g1', text: 'theirs' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: null, hlc: OLDER_HLC }, 1),
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: theirs, hlc: NEWER_HLC }, 5),
    ];

    const result = await pullOnce(makeDeps());

    expect(result).toEqual({ kind: 'complete' });
    expect(await getGoals()).toEqual([theirs]);
    const saved = await metaStore.load();
    expect(saved.dirty.goals).toBeUndefined();
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
    expect(saved.seqs['goals/g1']).toBe(5);
  });

  it('records no seq from a server record whose seq is not a seq, and says so', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const theirs = goalFactory.build({ id: 'g1', text: 'theirs' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: theirs, hlc: NEWER_HLC }, 1.5),
    ];

    await pullOnce(makeDeps());

    expect(await getGoals()).toEqual([theirs]);
    const saved = await metaStore.load();
    expect(saved.seqs['goals/g1']).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('Ignoring a server record whose seq is not a seq', {
      key: 'goals/g1',
      seq: 1.5,
    });
    warnSpy.mockRestore();
  });

  it('keeps the progress made earlier in the page when a later record stalls the pull', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const goal = goalFactory.build({ id: 'g1' });
    const sealed = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: goal, hlc: NEWER_HLC },
      1
    );
    const poisoned: SyncRecord = { ...sealed, ciphertext: 'garbage' };
    const wedging = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g2',
      { entity: goalFactory.build({ id: 'g2' }), hlc: NEWER_HLC },
      2
    );
    transport.pullRecords = [poisoned, wedging];
    const bindings = defaultBindings();
    vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
      storageFailure('quota exceeded')
    );
    const onQuarantine = vi.fn();

    const first = await pullOnce(makeDeps({ bindings, onQuarantine }));

    expect(first).toEqual({ kind: 'stalled', collection: 'goals', entityId: 'g2' });
    const afterStall = await metaStore.load();
    expect(afterStall.quarantine).toEqual(['goals/g1']);
    expect(afterStall.cursor).toBe(1);

    // Without that persisted progress the wedged device re-quarantines g1 on every 5-minute wake,
    // re-toasting "a synced item couldn't be read" forever.
    const second = await pullOnce(makeDeps({ bindings, onQuarantine }));

    expect(second).toEqual({ kind: 'stalled', collection: 'goals', entityId: 'g2' });
    expect(onQuarantine).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  // readAll decides the conflict, so an unreadable collection must stop the cycle where it
  // stands rather than resolve every incoming record against an empty local view.
  it('stops without advancing the cursor when the local collection cannot be read', async () => {
    const goal = goalFactory.build({ id: 'g1' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: goal, hlc: NEWER_HLC }, 1),
    ];
    kv.failGetManyForKey = 'goals';

    await expect(pullOnce(makeDeps())).rejects.toThrow();

    kv.failGetManyForKey = null;
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(0);
    expect(saved.hlcs['goals/g1']).toBeUndefined();
  });

  it('fetches a second page when the first getChanges call returns a full page', async () => {
    const records: SyncRecord[] = [];
    for (let seq = 1; seq <= PULL_PAGE; seq++) {
      const body: RecordBody = { entity: null, hlc: NEWER_HLC };
      records.push(await sealServerRecord(dk, KEY_ID, 'unsynced-collection', `e${seq}`, body, seq));
    }
    transport.pullRecords = records;

    await pullOnce(makeDeps());

    expect(transport.getChangesSinceCalls).toEqual([0, PULL_PAGE]);
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(PULL_PAGE);
  });

  it('resets the cursor to 0 when the transport throws a resync_required 409', async () => {
    const meta = await metaStore.load();
    meta.cursor = 42;
    await metaStore.save(meta);
    transport.getChangesError = new ApiError('resync_required', 409);

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.cursor).toBe(0);
  });

  it('reports a refused cursor rather than a completed pull', async () => {
    const deps = makeDeps();
    transport.rejectNextGetChangesWithResync();

    const result = await pullOnce(deps);

    expect(result).toEqual({ kind: 'resynced' });
  });

  it('serves the pull after a scripted resync refusal normally, since that script is one-shot', async () => {
    transport.rejectNextGetChangesWithResync();

    await expect(pullOnce(makeDeps())).resolves.toEqual({ kind: 'resynced' });
    await expect(pullOnce(makeDeps())).resolves.toEqual({ kind: 'complete' });
  });

  it('reports a normal pull as complete', async () => {
    const deps = makeDeps();

    const result = await pullOnce(deps);

    expect(result).toEqual({ kind: 'complete' });
  });

  it('propagates a non-resync ApiError from getChanges without resetting the cursor', async () => {
    const meta = await metaStore.load();
    meta.cursor = 7;
    await metaStore.save(meta);
    transport.getChangesError = new ApiError('invalid_token', 401);

    await expect(pullOnce(makeDeps())).rejects.toThrow(ApiError);

    const saved = await metaStore.load();
    expect(saved.cursor).toBe(7);
  });

  it('treats a local entity with no known hlc as unknown, so a matching incoming record applies without throwing', async () => {
    // Legacy pre-sync data: the entity exists locally but meta.hlcs has no entry for it.
    const local = goalFactory.build({ id: 'g1', text: 'legacy-local' });
    await setGoals([local]);
    const incomingGoal = goalFactory.build({ id: 'g1', text: 'incoming' });
    const rec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: incomingGoal, hlc: NEWER_HLC },
      1
    );
    transport.pullRecords = [rec];

    await expect(pullOnce(makeDeps())).resolves.toEqual({ kind: 'complete' });

    const goals = await getGoals();
    expect(goals).toEqual([incomingGoal]);
    const saved = await metaStore.load();
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
  });

  it('does not move the cursor backward when a later record in the page carries a lower seq', async () => {
    const firstGoal = goalFactory.build({ id: 'g1' });
    const secondGoal = goalFactory.build({ id: 'g2' });
    const higherSeqRec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: firstGoal, hlc: NEWER_HLC },
      5
    );
    const lowerSeqRec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g2',
      { entity: secondGoal, hlc: NEWER_HLC },
      3
    );
    transport.pullRecords = [higherSeqRec, lowerSeqRec];

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.cursor).toBe(5);
  });

  it('never reaches the server when the cycle is already cancelled, and says nothing', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await pullOnce(makeDeps({ isCancelled: () => true }));

    expect(result).toEqual({ kind: 'cancelled' });
    expect(transport.getChangesSinceCalls).toEqual([]);
    // Nothing landed, so there is nothing to attribute: a disconnect is not itself a fault.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('stops mid-page once cancelled, so the rest of the removed account’s records never land', async () => {
    const first = goalFactory.build({ id: 'g1', text: 'first' });
    const second = goalFactory.build({ id: 'g2', text: 'second' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: first, hlc: NEWER_HLC }, 1),
      await sealServerRecord(dk, KEY_ID, 'goals', 'g2', { entity: second, hlc: NEWER_HLC }, 2),
    ];
    const bindings = defaultBindings();
    const { isCancelled } = disableAfterFirstWrite(requireBinding(bindings, 'goals'));

    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const result = await pullOnce(makeDeps({ bindings, isCancelled }));

    expect(result).toEqual({ kind: 'cancelled' });
    expect(await getGoals()).toEqual([first]);
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(0);
    // The record that did land has no hlc left to explain it, so this count is its only trace.
    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync stopped a pull for a disconnected account; 1 of its records had already been applied to this device'
    );
    errorSpy.mockRestore();
  });

  it('persists no cursor when the account is removed while the last record of a page is applied', async () => {
    // The narrow window the per-record check cannot see: nothing is left to check, so only the
    // guard on the save keeps an advanced cursor from outliving the account that earned it.
    const goal = goalFactory.build({ id: 'g1' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: goal, hlc: NEWER_HLC }, 1),
    ];
    const bindings = defaultBindings();
    const { isCancelled } = disableAfterFirstWrite(requireBinding(bindings, 'goals'));

    const result = await pullOnce(makeDeps({ bindings, isCancelled }));

    expect(result).toEqual({ kind: 'cancelled' });
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(0);
    expect(saved.hlcs['goals/g1']).toBeUndefined();
  });

  it('counts only the records it actually wrote when reporting what a cancelled pull left', async () => {
    // The count is the sole trace of what a disconnect left behind, so a quarantined record —
    // which writes nothing — must not inflate it.
    const sealed = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: null, hlc: NEWER_HLC },
      1
    );
    const poisoned: SyncRecord = { ...sealed, ciphertext: 'garbage' };
    // A record the strategy resolves to local writes nothing either, so it must not count.
    await setGoals([goalFactory.build({ id: 'g3', text: 'local' })]);
    await seedLocalHlc(metaStore, 'goals', 'g3', NEWER_HLC);
    const lost = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g3',
      { entity: goalFactory.build({ id: 'g3', text: 'stale' }), hlc: OLDER_HLC },
      2
    );
    const good = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g2',
      { entity: goalFactory.build({ id: 'g2' }), hlc: NEWER_HLC },
      3
    );
    transport.pullRecords = [poisoned, lost, good];
    const bindings = defaultBindings();
    const { isCancelled } = disableAfterFirstWrite(requireBinding(bindings, 'goals'));
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await pullOnce(makeDeps({ bindings, isCancelled }));

    expect(errorSpy).toHaveBeenCalledWith(
      'Cloud sync stopped a pull for a disconnected account; 1 of its records had already been applied to this device'
    );
    errorSpy.mockRestore();
  });

  it('persists nothing when a write fails at the moment the account is removed', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    transport.pullRecords = [
      await sealServerRecord(
        dk,
        KEY_ID,
        'goals',
        'g1',
        { entity: goalFactory.build({ id: 'g1' }), hlc: NEWER_HLC },
        1
      ),
      await sealServerRecord(
        dk,
        KEY_ID,
        'goals',
        'g2',
        { entity: goalFactory.build({ id: 'g2' }), hlc: NEWER_HLC },
        2
      ),
    ];
    const bindings = defaultBindings();
    const goals = requireBinding(bindings, 'goals');
    const write = goals.writeOne.bind(goals);
    let disabled = false;
    vi.spyOn(goals, 'writeOne').mockImplementation(async (entityId, entity) => {
      if (entityId === 'g2') {
        disabled = true;
        return storageFailure('quota exceeded');
      }
      return write(entityId, entity);
    });

    const result = await pullOnce(makeDeps({ bindings, isCancelled: () => disabled }));

    // A stall saves the progress before it; that save must still not run for a removed account,
    // or the cursor and hlcs it advanced outlive the account that earned them.
    expect(result).toEqual({ kind: 'cancelled' });
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(0);
    expect(saved.hlcs['goals/g1']).toBeUndefined();
    errorSpy.mockRestore();
  });

  it('persists nothing when the server discards the cursor of an account already removed', async () => {
    const meta = await metaStore.load();
    meta.cursor = 42;
    await metaStore.save(meta);
    transport.getChangesError = new ApiError('resync_required', 409);

    // Cancelled only once the request has been made, so the 409 branch is the one that runs.
    const result = await pullOnce(
      makeDeps({ isCancelled: () => transport.getChangesSinceCalls.length > 0 })
    );

    expect(result).toEqual({ kind: 'cancelled' });
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(42);
  });

  it('recovers a quarantined key once a later pull decrypts it cleanly, removing it from quarantine', async () => {
    const goal = goalFactory.build({ id: 'g1' });
    const sealed = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: goal, hlc: NEWER_HLC },
      1
    );
    const poisoned: SyncRecord = { ...sealed, ciphertext: 'garbage' };
    transport.pullRecords = [poisoned];

    await pullOnce(makeDeps());

    const afterQuarantine = await metaStore.load();
    expect(afterQuarantine.quarantine).toEqual(['goals/g1']);

    const recoveredGoal = goalFactory.build({ id: 'g1', text: 'recovered' });
    const recoveredRec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: recoveredGoal, hlc: NEWER_HLC },
      2
    );
    transport.pullRecords = [recoveredRec];

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.quarantine).toEqual([]);
    const goals = await getGoals();
    expect(goals).toEqual([recoveredGoal]);
  });

  it('keeps an edit marked dirty while the pull was in flight', async () => {
    const incoming = goalFactory.build({ id: 'g1', text: 'incoming' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: incoming, hlc: NEWER_HLC }, 1),
    ];
    const tracker = new MutationTracker(metaStore, () => 1000);
    duringPull(transport, () => tracker.markMutated('goals', 'g2'));

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.dirty.goals).toEqual(['g2']);
    expect(saved.hlcs['goals/g2']).toBeDefined();
    expect(saved.cursor).toBe(1);
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
  });

  it('keeps an hlc a concurrent edit stamped ahead of the pull’s own', async () => {
    await setGoals([goalFactory.build({ id: 'g1', text: 'local' })]);
    await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    transport.pullRecords = [
      await sealServerRecord(
        dk,
        KEY_ID,
        'goals',
        'g1',
        { entity: goalFactory.build({ id: 'g1', text: 'incoming' }), hlc: NEWER_HLC },
        1
      ),
    ];
    const tracker = new MutationTracker(metaStore, () => AHEAD_OF_PULL_MS);
    duringPull(transport, () => tracker.markMutated('goals', 'g1'));

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.hlcs['goals/g1'] > NEWER_HLC).toBe(true);
    expect(saved.dirty.goals).toEqual(['g1']);
  });

  it('keeps a tombstone a concurrent delete stamped ahead of the pull’s resurrection', async () => {
    const meta = await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    meta.tombstones = ['goals/g1'];
    await metaStore.save(meta);
    transport.pullRecords = [
      await sealServerRecord(
        dk,
        KEY_ID,
        'goals',
        'g1',
        { entity: goalFactory.build({ id: 'g1' }), hlc: NEWER_HLC },
        1
      ),
    ];
    const tracker = new MutationTracker(metaStore, () => AHEAD_OF_PULL_MS);
    duringPull(transport, () => tracker.markDeleted('goals', 'g1'));

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.tombstones).toContain('goals/g1');
  });

  // Otherwise every pull that re-applies the same delete adds another copy of the key.
  it('does not duplicate a tombstone the ledger already holds', async () => {
    const meta = await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    meta.tombstones = ['goals/g1'];
    await metaStore.save(meta);
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: null, hlc: NEWER_HLC }, 1),
    ];

    await pullOnce(makeDeps());

    expect((await metaStore.load()).tombstones).toEqual(['goals/g1']);
  });

  it('keeps a key another cycle quarantined while this pull was in flight', async () => {
    const sealed = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: null, hlc: NEWER_HLC },
      1
    );
    transport.pullRecords = [{ ...sealed, ciphertext: 'garbage' }];
    duringPull(transport, () =>
      metaStore.update((meta) => {
        meta.quarantine.push('quotes/q9');
      })
    );

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.quarantine).toContain('quotes/q9');
    expect(saved.quarantine).toContain('goals/g1');
  });

  it('leaves the cursor where a concurrent writer moved it rather than rewinding it', async () => {
    const goal = goalFactory.build({ id: 'g1' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: goal, hlc: NEWER_HLC }, 1),
    ];
    duringPull(transport, () =>
      metaStore.update((meta) => {
        meta.cursor = 99;
      })
    );

    await pullOnce(makeDeps());

    expect((await metaStore.load()).cursor).toBe(99);
  });

  it('never lowers the device clock a concurrent writer advanced past the pull’s own', async () => {
    const ahead = hlcEncode({ physical: 2_000_000_000_000, counter: 0, node: 'device-b' });
    transport.pullRecords = [
      await sealServerRecord(
        dk,
        KEY_ID,
        'goals',
        'g1',
        { entity: goalFactory.build({ id: 'g1' }), hlc: NEWER_HLC },
        1
      ),
    ];
    duringPull(transport, () =>
      metaStore.update((meta) => {
        meta.clock = ahead;
      })
    );

    await pullOnce(makeDeps());

    expect((await metaStore.load()).clock >= ahead).toBe(true);
  });

  it('tombstones a key a pulled delete removed', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: null, hlc: NEWER_HLC }, 1),
    ];

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.tombstones).toContain('goals/g1');
    expect(await getGoals()).toEqual([]);
  });

  it('clears the tombstone of a key a pulled record resurrected', async () => {
    const meta = await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    meta.tombstones = ['goals/g1'];
    await metaStore.save(meta);
    const revived = goalFactory.build({ id: 'g1', text: 'revived' });
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'goals', 'g1', { entity: revived, hlc: NEWER_HLC }, 1),
    ];

    await pullOnce(makeDeps());

    const saved = await metaStore.load();
    expect(saved.tombstones).not.toContain('goals/g1');
    expect(await getGoals()).toEqual([revived]);
  });

  // The only trace of what a healthy cycle moved: nothing else logs on the success path.
  it('summarises what it applied, with the cursor it moved and no entity ids', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const incoming = goalFactory.build({ id: 'g1', text: 'incoming' });
    const rec = await sealServerRecord(
      dk,
      KEY_ID,
      'goals',
      'g1',
      { entity: incoming, hlc: NEWER_HLC },
      1
    );
    transport.pullRecords = [rec];

    await pullOnce(makeDeps());

    expect(debugSpy).toHaveBeenCalledWith('Sync pull applied 1 record(s)', {
      byCollection: { goals: 1 },
      cursor: '0 -> 1',
    });
    expect(JSON.stringify(debugSpy.mock.calls)).not.toContain('incoming');
  });

  it('owes a purge relist once the server refuses its cursor as past its purge', async () => {
    transport.rejectNextGetChangesWithResync();

    await pullOnce(makeDeps());

    expect((await metaStore.load()).relistOwed).toBe('purged');
  });

  it('owes a restore relist, and drops every seq, once the server refuses its cursor as ahead', async () => {
    await seedSynced(metaStore, 'goals', 'g1', 2);
    transport.rejectNextGetChanges(new ApiError('cursor_ahead', 409));

    await expect(pullOnce(makeDeps())).resolves.toEqual({ kind: 'resynced' });

    const saved = await metaStore.load();
    expect(saved.relistOwed).toBe('restored');
    expect(saved.seqs).toEqual({});
  });

  it('keeps no seq from earlier pages when a later page is refused as ahead', async () => {
    transport.pullRecords = await quoteTombstones(PULL_PAGE + 1);
    duringPull(transport, async () => {
      transport.rejectNextGetChanges(new ApiError('cursor_ahead', 409));
    });

    await pullOnce(makeDeps());

    expect((await metaStore.load()).seqs).toEqual({});
  });

  it('never lets a purge refusal replace an owed restore relist', async () => {
    await metaStore.update((meta) => {
      meta.relistOwed = 'restored';
    });
    transport.rejectNextGetChangesWithResync();

    await pullOnce(makeDeps());

    expect((await metaStore.load()).relistOwed).toBe('restored');
  });

  it('marks every page after the first of a listing from zero as a full listing', async () => {
    transport.pullRecords = await quoteTombstones(PULL_PAGE + 1);

    await pullOnce(makeDeps());

    expect(transport.getChangesFullListing).toEqual([false, true]);
  });

  it('marks no page of an incremental pull as a full listing', async () => {
    await metaStore.update((meta) => {
      meta.cursor = 1;
    });
    transport.pullRecords = await quoteTombstones(PULL_PAGE + 2);

    await pullOnce(makeDeps());

    expect(transport.getChangesFullListing).toEqual([false, false]);
  });

  it('takes the cursor a final page answers past its last record', async () => {
    transport.pullRecords = [
      await sealServerRecord(dk, KEY_ID, 'quotes', 'q1', { entity: null, hlc: OLDER_HLC }, 1),
    ];
    transport.finalPageCursor = 4;

    await pullOnce(makeDeps());

    expect((await metaStore.load()).cursor).toBe(4);
  });

  describe('an entity the listing after a restore refusal no longer names', () => {
    const lost = goalFactory.build({ id: 'g1', text: 'pushed after the backup' });
    const kept = goalFactory.build({ id: 'g2', text: 'in the backup' });

    beforeEach(async () => {
      await setGoals([lost, kept]);
      await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
      await seedLocalHlc(metaStore, 'goals', 'g2', OLDER_HLC);
      await metaStore.update((meta) => {
        meta.relistOwed = 'restored';
      });
      transport.pullRecords = [
        await sealServerRecord(dk, KEY_ID, 'goals', 'g2', { entity: kept, hlc: OLDER_HLC }, 1),
      ];
    });

    it('is kept and marked to push again, since the rollback lost it', async () => {
      await expect(pullOnce(makeDeps())).resolves.toEqual({ kind: 'complete' });

      expect(await getGoals()).toEqual([lost, kept]);
      const saved = await metaStore.load();
      expect(saved.dirty.goals).toEqual(['g1']);
      expect(saved.relistOwed).toBeUndefined();
    });

    it('stalls when a collection cannot be read, still owing the restore relist', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      const bindings = defaultBindings();
      failReadsAfterFirst(requireBinding(bindings, 'goals'));

      await expect(pullOnce(makeDeps({ bindings }))).resolves.toMatchObject({ kind: 'stalled' });

      const saved = await metaStore.load();
      expect(saved.relistOwed).toBe('restored');
      expect(saved.cursor).toBe(0);
    });

    it('still marks the lost entities of a readable collection when another cannot be read', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      const bindings = defaultBindings();
      await requireBinding(bindings, 'quotes').writeOne('q1', quoteFactory.build({ id: 'q1' }));
      await seedLocalHlc(metaStore, 'quotes', 'q1', OLDER_HLC);
      failReadsAfterFirst(requireBinding(bindings, 'goals'));

      await pullOnce(makeDeps({ bindings }));

      expect((await metaStore.load()).dirty.quotes).toEqual(['q1']);
    });

    it('restarts a restore relist at 0 when a listed record cannot be written', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      transport.pullRecords = [
        await sealServerRecord(dk, KEY_ID, 'quotes', 'q1', { entity: null, hlc: OLDER_HLC }, 1),
        await sealServerRecord(dk, KEY_ID, 'goals', 'g2', { entity: null, hlc: NEWER_HLC }, 2),
      ];
      const bindings = defaultBindings();
      vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
        storageFailure('quota exceeded')
      );

      await pullOnce(makeDeps({ bindings }));

      const saved = await metaStore.load();
      expect(saved.relistOwed).toBe('restored');
      expect(saved.cursor).toBe(0);
    });

    it('is left alone when this device never synced it', async () => {
      await metaStore.update((meta) => {
        delete meta.hlcs['goals/g1'];
      });

      await pullOnce(makeDeps());

      expect((await metaStore.load()).dirty.goals).toBeUndefined();
    });
  });

  describe('an entity the listing after a refused cursor no longer names', () => {
    const purged = goalFactory.build({ id: 'g1', text: 'deleted elsewhere' });
    const kept = goalFactory.build({ id: 'g2', text: 'still on the server' });

    async function listOnly(entity: typeof kept, seq: number): Promise<void> {
      transport.pullRecords = [
        await sealServerRecord(dk, KEY_ID, 'goals', entity.id, { entity, hlc: OLDER_HLC }, seq),
      ];
    }

    beforeEach(async () => {
      await setGoals([purged, kept]);
      await seedSynced(metaStore, 'goals', 'g1', 2);
      await seedSynced(metaStore, 'goals', 'g2', 3);
      await metaStore.update((meta) => {
        meta.relistOwed = 'purged';
      });
      await listOnly(kept, 3);
    });

    it('is deleted locally and forgotten, as a delete whose tombstone the server purged', async () => {
      await expect(pullOnce(makeDeps())).resolves.toEqual({ kind: 'complete' });

      expect(await getGoals()).toEqual([kept]);
      const saved = await metaStore.load();
      expect(saved.hlcs['goals/g1']).toBeUndefined();
      expect(saved.seqs['goals/g1']).toBeUndefined();
      expect(saved.seqs['goals/g2']).toBe(3);
    });

    it('settles the owed check once the listing completes', async () => {
      await pullOnce(makeDeps());

      expect((await metaStore.load()).relistOwed).toBeUndefined();
    });

    it('leaves a restore relist raised during the listing owed', async () => {
      duringPull(transport, () =>
        metaStore.update((meta) => {
          meta.relistOwed = 'restored';
        })
      );

      await pullOnce(makeDeps());

      expect((await metaStore.load()).relistOwed).toBe('restored');
    });

    it('is kept when it is edited after the check read the ledger, before its delete', async () => {
      const bindings = defaultBindings();
      const goals = requireBinding(bindings, 'goals');
      const readAll = goals.readAll.bind(goals);
      const tracker = new MutationTracker(metaStore, () => AHEAD_OF_PULL_MS);
      vi.spyOn(goals, 'readAll')
        .mockImplementationOnce(readAll)
        .mockImplementationOnce(async () => {
          const local = await readAll();
          await tracker.markMutated('goals', 'g1');
          return local;
        });

      await pullOnce(makeDeps({ bindings }));

      expect(await getGoals()).toEqual([purged, kept]);
    });

    it('lists from zero while the check is owed, whatever the cursor says', async () => {
      await metaStore.update((meta) => {
        meta.cursor = 3;
      });

      await pullOnce(makeDeps());

      expect(transport.getChangesSinceCalls).toEqual([0]);
      expect(await getGoals()).toEqual([kept]);
    });

    it('is kept by a pull from zero no refusal asked for, as after a database restore', async () => {
      await metaStore.update((meta) => {
        delete meta.relistOwed;
      });

      await pullOnce(makeDeps());

      expect(await getGoals()).toEqual([purged, kept]);
    });

    it('leaves settings alone, since a settings key is never deleted', async () => {
      await seedSynced(metaStore, 'settings', 'theme', 1);

      await pullOnce(makeDeps());

      expect((await metaStore.load()).seqs['settings/theme']).toBe(1);
    });

    it('stalls when a collection cannot be read, still owing the check', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      const bindings = defaultBindings();
      failReadsAfterFirst(requireBinding(bindings, 'goals'));

      await expect(pullOnce(makeDeps({ bindings }))).resolves.toEqual({
        kind: 'stalled',
        collection: 'goals',
        entityId: '*',
      });

      const saved = await metaStore.load();
      expect(saved.relistOwed).toBe('purged');
      expect(saved.cursor).toBe(0);
    });

    it('is kept while it has an edit waiting to push', async () => {
      await new MutationTracker(metaStore, () => AHEAD_OF_PULL_MS).markMutated('goals', 'g1');

      await pullOnce(makeDeps());

      expect(await getGoals()).toEqual([purged, kept]);
    });

    it('is kept when it is edited while the pull is in flight', async () => {
      const tracker = new MutationTracker(metaStore, () => AHEAD_OF_PULL_MS);
      duringPull(transport, () => tracker.markMutated('goals', 'g1'));

      await pullOnce(makeDeps());

      expect(await getGoals()).toEqual([purged, kept]);
      expect((await metaStore.load()).dirty.goals).toEqual(['g1']);
    });

    it('keeps the ledger of a key edited while its delete was being written', async () => {
      const bindings = defaultBindings();
      const goals = requireBinding(bindings, 'goals');
      const writeOne = goals.writeOne.bind(goals);
      const tracker = new MutationTracker(metaStore, () => AHEAD_OF_PULL_MS);
      vi.spyOn(goals, 'writeOne').mockImplementation(async (entityId, entity) => {
        const res = await writeOne(entityId, entity);
        await tracker.markMutated('goals', entityId);
        return res;
      });

      await pullOnce(makeDeps({ bindings }));

      const saved = await metaStore.load();
      expect(saved.seqs['goals/g1']).toBe(2);
      expect(saved.hlcs['goals/g1']).not.toBe(OLDER_HLC);
      expect(saved.dirty.goals).toEqual(['g1']);
    });

    it('is kept when the server never held it', async () => {
      const meta = await metaStore.load();
      delete meta.seqs['goals/g1'];
      await metaStore.save(meta);

      await pullOnce(makeDeps());

      expect(await getGoals()).toEqual([purged, kept]);
    });

    it('is kept when a push acked it while the pull was in flight', async () => {
      duringPull(transport, () =>
        metaStore.update((meta) => {
          meta.seqs['goals/g1'] = 9;
        })
      );

      await pullOnce(makeDeps());

      expect(await getGoals()).toEqual([purged, kept]);
    });

    it('is kept when the pull stalls before the listing ends', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      const bindings = defaultBindings();
      const goals = requireBinding(bindings, 'goals');
      const writeOne = goals.writeOne.bind(goals);
      vi.spyOn(goals, 'writeOne').mockImplementation(async (entityId, entity) => {
        if (entityId === 'g2') {
          return storageFailure('quota exceeded');
        }
        return writeOne(entityId, entity);
      });
      await listOnly(goalFactory.build({ id: 'g2', text: 'newer' }), 3);
      const meta = await metaStore.load();
      delete meta.hlcs['goals/g2'];
      await metaStore.save(meta);

      await expect(pullOnce(makeDeps({ bindings }))).resolves.toMatchObject({ kind: 'stalled' });

      expect(await getGoals()).toEqual([purged, kept]);
    });

    it('is deleted by the next pull once a stall in the pull from zero clears', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      const bindings = defaultBindings();
      vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValueOnce(
        storageFailure('quota exceeded')
      );
      const newer = goalFactory.build({ id: 'g2', text: 'newer' });
      transport.pullRecords = [
        await sealServerRecord(dk, KEY_ID, 'quotes', 'q1', { entity: null, hlc: OLDER_HLC }, 1),
        await sealServerRecord(dk, KEY_ID, 'goals', 'g2', { entity: newer, hlc: OLDER_HLC }, 3),
      ];
      const meta = await metaStore.load();
      delete meta.hlcs['goals/g2'];
      await metaStore.save(meta);
      await pullOnce(makeDeps({ bindings }));

      await expect(pullOnce(makeDeps({ bindings }))).resolves.toEqual({ kind: 'complete' });

      expect((await getGoals()).map((g) => g.id)).toEqual(['g2']);
    });

    it('stalls on a delete that fails, keeping the entity and its seq to try again', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      const bindings = defaultBindings();
      vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
        storageFailure('quota exceeded')
      );

      await expect(pullOnce(makeDeps({ bindings }))).resolves.toEqual({
        kind: 'stalled',
        collection: 'goals',
        entityId: 'g1',
      });

      expect(await getGoals()).toEqual([purged, kept]);
      const saved = await metaStore.load();
      expect(saved.seqs['goals/g1']).toBe(2);
      expect(saved.cursor).toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        'Sync could not delete an entity whose server row was purged',
        expect.objectContaining({ collection: 'goals', entityId: 'g1' })
      );
    });

    it('stops deleting, and saves nothing, once the account is disconnected', async () => {
      vi.spyOn(logger, 'error').mockImplementation(() => {});
      const alsoPurged = goalFactory.build({ id: 'g3' });
      await setGoals([purged, kept, alsoPurged]);
      await seedSynced(metaStore, 'goals', 'g3', 1);
      const bindings = defaultBindings();
      const { isCancelled } = disableAfterFirstWrite(requireBinding(bindings, 'goals'));

      await expect(pullOnce(makeDeps({ bindings, isCancelled }))).resolves.toEqual({
        kind: 'cancelled',
      });

      expect((await getGoals()).map((g) => g.id)).toEqual(['g2', 'g3']);
      const saved = await metaStore.load();
      expect(saved.seqs['goals/g1']).toBe(2);
      expect(saved.cursor).toBe(0);
    });

    it('keeps every entity a listing spread over several pages names', async () => {
      const many = Array.from({ length: PULL_PAGE + 1 }, (_, i) =>
        goalFactory.build({ id: `p${i}` })
      );
      await setGoals(many);
      const meta = await metaStore.load();
      transport.pullRecords = [];
      for (const [i, goal] of many.entries()) {
        const key = SyncMetadataStore.entityKey('goals', goal.id);
        meta.hlcs[key] = OLDER_HLC;
        meta.seqs[key] = i + 1;
        transport.pullRecords.push(
          await sealServerRecord(
            dk,
            KEY_ID,
            'goals',
            goal.id,
            { entity: goal, hlc: OLDER_HLC },
            i + 1
          )
        );
      }
      await metaStore.save(meta);

      await pullOnce(makeDeps());

      expect(await getGoals()).toHaveLength(PULL_PAGE + 1);
    });
  });
});
