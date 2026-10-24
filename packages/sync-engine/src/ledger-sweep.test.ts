import { configurePlatform, DAY_IN_MS, hlcEncode } from '@cuewise/shared';
import { setGoals } from '@cuewise/storage';
import { goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireBinding } from './__fixtures__/bindings';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { type CollectionBinding, defaultBindings } from './collections';
import { forgetSettledDeletes, LEDGER_RETENTION_MS } from './ledger-sweep';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';

const NOW = 1_800_000_000_000;
const GOAL_KEY = SyncMetadataStore.entityKey('goals', 'g1');

function hlcAgo(ms: number): string {
  return hlcEncode({ physical: NOW - ms, counter: 0, node: 'device-a' });
}

describe('forgetSettledDeletes', () => {
  let metaStore: SyncMetadataStore;
  let bindings: CollectionBinding[];
  let cancelled: boolean;

  beforeEach(() => {
    const kv = new FakeKvStore();
    configurePlatform({ storage: kv });
    metaStore = new SyncMetadataStore(kv);
    bindings = defaultBindings();
    cancelled = false;
  });

  function sweep(now = NOW): Promise<number> {
    return forgetSettledDeletes({
      meta: metaStore,
      bindings,
      now: () => now,
      isCancelled: () => cancelled,
    });
  }

  /** A goal deleted `age` ago whose delete the server acked at seq 7. */
  function seedDelete(age: number, edit: (meta: SyncMeta) => void = () => {}): Promise<void> {
    return metaStore.update((meta) => {
      meta.hlcs[GOAL_KEY] = hlcAgo(age);
      meta.seqs[GOAL_KEY] = 7;
      edit(meta);
    });
  }

  async function ledgerHolds(key: string): Promise<boolean> {
    const meta = await metaStore.load();
    return key in meta.hlcs || key in meta.seqs || meta.tombstones.includes(key);
  }

  it('forgets an acked delete older than the retention window', async () => {
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS, (meta) => {
      meta.tombstones.push(GOAL_KEY);
    });

    expect(await sweep()).toBe(1);
    expect(await ledgerHolds(GOAL_KEY)).toBe(false);
  });

  it('keeps a delete still inside the retention window', async () => {
    await seedDelete(LEDGER_RETENTION_MS - DAY_IN_MS);

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(GOAL_KEY)).toBe(true);
  });

  it('keeps a delete the server never acked', async () => {
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS, (meta) => {
      delete meta.seqs[GOAL_KEY];
    });

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(GOAL_KEY)).toBe(true);
  });

  it('keeps a delete still waiting to push', async () => {
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS, (meta) => {
      meta.dirty.goals = ['g1'];
    });

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(GOAL_KEY)).toBe(true);
  });

  it('keeps an entity that still exists locally', async () => {
    await setGoals([goalFactory.build({ id: 'g1' })]);
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS);

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(GOAL_KEY)).toBe(true);
  });

  it('keeps a settings key even when it reads as absent locally', async () => {
    const key = SyncMetadataStore.entityKey('settings', 'retiredKey');
    await metaStore.update((meta) => {
      meta.hlcs[key] = hlcAgo(LEDGER_RETENTION_MS + DAY_IN_MS);
      meta.seqs[key] = 3;
    });

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(key)).toBe(true);
  });

  it('keeps a quarantined key', async () => {
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS, (meta) => {
      meta.quarantine.push(GOAL_KEY);
    });

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(GOAL_KEY)).toBe(true);
  });

  it('skips a collection it cannot read', async () => {
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS);
    vi.spyOn(requireBinding(bindings, 'goals'), 'readAll').mockRejectedValue(new Error('io'));

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(GOAL_KEY)).toBe(true);
  });

  it.each([
    ['cannot decode', 'not-an-hlc'],
    ['decodes to no time', 'x:0:device-a'],
  ])('skips an hlc it %s and forgets the rest', async (_, hlc) => {
    const broken = SyncMetadataStore.entityKey('goals', 'g2');
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS, (meta) => {
      meta.hlcs[broken] = hlc;
      meta.seqs[broken] = 8;
    });

    expect(await sweep()).toBe(1);
    expect(await ledgerHolds(broken)).toBe(true);
  });

  it.each([
    [
      're-stamped',
      (meta: SyncMeta) => {
        meta.hlcs[GOAL_KEY] = hlcAgo(0);
      },
    ],
    [
      'marked dirty',
      (meta: SyncMeta) => {
        meta.dirty.goals = ['g1'];
      },
    ],
  ])('keeps a key %s while the sweep was reading', async (_, landing) => {
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS);
    const load = metaStore.load.bind(metaStore);
    vi.spyOn(metaStore, 'load').mockImplementationOnce(async () => {
      const snapshot = await load();
      await metaStore.update(landing);
      return snapshot;
    });

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(GOAL_KEY)).toBe(true);
  });

  it('writes nothing once the cycle is cancelled', async () => {
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS);
    cancelled = true;

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(GOAL_KEY)).toBe(true);
    expect((await metaStore.load()).ledgerSweptAt).toBeUndefined();
  });

  it('runs at most once a day', async () => {
    await sweep();
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS);

    expect(await sweep(NOW + DAY_IN_MS - 1)).toBe(0);
    expect(await sweep(NOW + DAY_IN_MS)).toBe(1);
  });
});
