import { generateDataKey } from '@cuewise/crypto';
import { configurePlatform, hlcEncode, type SyncRecord, storageFailure } from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import { ApiError } from '@cuewise/sync-client';
import { goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeTransport } from './__fixtures__/fake-transport';
import { type CollectionBinding, defaultBindings } from './collections';
import { type CycleDeps, PULL_PAGE, pullOnce } from './cycle';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';
import { toPushRecord } from './record-map';
import { LwwHlcStrategy, type RecordBody } from './strategy';

const KEY_ID = 'dk-1';
const OLDER_HLC = hlcEncode({ physical: 1_700_000_000_000, counter: 1, node: 'device-a' });
const NEWER_HLC = hlcEncode({ physical: 1_700_000_001_000, counter: 1, node: 'device-a' });

/** Seals a body with the shared dk/keyId and stamps it with a seq, as the server would. */
async function sealRecord(
  dk: ReturnType<typeof generateDataKey>,
  collection: string,
  entityId: string,
  body: RecordBody,
  seq: number
): Promise<SyncRecord> {
  const pushRecord = await toPushRecord(dk, KEY_ID, collection, entityId, body);
  return { ...pushRecord, seq };
}

/** Finds a named binding or fails loudly — avoids a non-null assertion at call sites. */
function requireBinding(bindings: CollectionBinding[], name: string): CollectionBinding {
  const binding = bindings.find((b) => b.name === name);
  if (binding === undefined) {
    throw new Error(`binding not found: ${name}`);
  }
  return binding;
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

  function makeDeps(overrides: Partial<CycleDeps> = {}): CycleDeps {
    return {
      transport,
      meta: metaStore,
      bindings: defaultBindings(),
      dk,
      keyId: KEY_ID,
      strategy: new LwwHlcStrategy(),
      ...overrides,
    };
  }

  it('overwrites local with a newer incoming record, advances the cursor, updates hlcs', async () => {
    const local = goalFactory.build({ id: 'g1', text: 'local' });
    await setGoals([local]);
    await seedLocalHlc(metaStore, 'goals', 'g1', OLDER_HLC);
    const incomingGoal = goalFactory.build({ id: 'g1', text: 'incoming' });
    const rec = await sealRecord(dk, 'goals', 'g1', { entity: incomingGoal, hlc: NEWER_HLC }, 1);
    transport.pullRecords = [rec];

    await pullOnce(makeDeps());

    const goals = await getGoals();
    expect(goals).toEqual([incomingGoal]);
    const saved = await metaStore.load();
    expect(saved.cursor).toBe(1);
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
  });

  it('keeps local when incoming is older, without writing, but still advances the cursor', async () => {
    const local = goalFactory.build({ id: 'g1', text: 'local' });
    await setGoals([local]);
    await seedLocalHlc(metaStore, 'goals', 'g1', NEWER_HLC);
    const staleGoal = goalFactory.build({ id: 'g1', text: 'stale' });
    const rec = await sealRecord(dk, 'goals', 'g1', { entity: staleGoal, hlc: OLDER_HLC }, 1);
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
  });

  it('quarantines a poison record, skips the write, fires onQuarantine once, and still advances the cursor', async () => {
    const goal = goalFactory.build({ id: 'g1' });
    const rec = await sealRecord(dk, 'goals', 'g1', { entity: goal, hlc: NEWER_HLC }, 1);
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

  it('stops before advancing the cursor when a write fails, so the record retries next cycle', async () => {
    const goal = goalFactory.build({ id: 'g1' });
    const rec = await sealRecord(dk, 'goals', 'g1', { entity: goal, hlc: NEWER_HLC }, 1);
    transport.pullRecords = [rec];
    const bindings = defaultBindings();
    vi.spyOn(requireBinding(bindings, 'goals'), 'writeOne').mockResolvedValue(
      storageFailure('quota exceeded')
    );

    await pullOnce(makeDeps({ bindings }));

    const saved = await metaStore.load();
    expect(saved.cursor).toBe(0);
    expect(saved.hlcs['goals/g1']).toBeUndefined();
  });

  it('fetches a second page when the first getChanges call returns a full page', async () => {
    const records: SyncRecord[] = [];
    for (let seq = 1; seq <= PULL_PAGE; seq++) {
      const body: RecordBody = { entity: null, hlc: NEWER_HLC };
      records.push(await sealRecord(dk, 'unsynced-collection', `e${seq}`, body, seq));
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
    const rec = await sealRecord(dk, 'goals', 'g1', { entity: incomingGoal, hlc: NEWER_HLC }, 1);
    transport.pullRecords = [rec];

    await expect(pullOnce(makeDeps())).resolves.toBeUndefined();

    const goals = await getGoals();
    expect(goals).toEqual([incomingGoal]);
    const saved = await metaStore.load();
    expect(saved.hlcs['goals/g1']).toBe(NEWER_HLC);
  });

  it('does not move the cursor backward when a later record in the page carries a lower seq', async () => {
    const firstGoal = goalFactory.build({ id: 'g1' });
    const secondGoal = goalFactory.build({ id: 'g2' });
    const higherSeqRec = await sealRecord(
      dk,
      'goals',
      'g1',
      { entity: firstGoal, hlc: NEWER_HLC },
      5
    );
    const lowerSeqRec = await sealRecord(
      dk,
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

  it('recovers a quarantined key once a later pull decrypts it cleanly, removing it from quarantine', async () => {
    const goal = goalFactory.build({ id: 'g1' });
    const sealed = await sealRecord(dk, 'goals', 'g1', { entity: goal, hlc: NEWER_HLC }, 1);
    const poisoned: SyncRecord = { ...sealed, ciphertext: 'garbage' };
    transport.pullRecords = [poisoned];

    await pullOnce(makeDeps());

    const afterQuarantine = await metaStore.load();
    expect(afterQuarantine.quarantine).toEqual(['goals/g1']);

    const recoveredGoal = goalFactory.build({ id: 'g1', text: 'recovered' });
    const recoveredRec = await sealRecord(
      dk,
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
});
