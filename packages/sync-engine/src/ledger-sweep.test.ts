import { configurePlatform, DAY_IN_MS, hlcEncode } from '@cuewise/shared';
import { setGoals } from '@cuewise/storage';
import { goalFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { defaultBindings } from './collections';
import { forgetSettledDeletes, LEDGER_RETENTION_MS } from './ledger-sweep';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';

const NOW = 1_800_000_000_000;
const GOAL_KEY = SyncMetadataStore.entityKey('goals', 'g1');

function hlcAgo(ms: number): string {
  return hlcEncode({ physical: NOW - ms, counter: 0, node: 'device-a' });
}

describe('forgetSettledDeletes', () => {
  let metaStore: SyncMetadataStore;
  let cancelled: boolean;

  beforeEach(() => {
    const kv = new FakeKvStore();
    configurePlatform({ storage: kv });
    metaStore = new SyncMetadataStore(kv);
    cancelled = false;
  });

  function sweep(now = NOW): Promise<number> {
    return forgetSettledDeletes({
      meta: metaStore,
      bindings: defaultBindings(),
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

  it('keeps a settings key, which reads as absent at its default', async () => {
    const key = SyncMetadataStore.entityKey('settings', 'theme');
    await metaStore.update((meta) => {
      meta.hlcs[key] = hlcAgo(LEDGER_RETENTION_MS + DAY_IN_MS);
      meta.seqs[key] = 3;
    });

    expect(await sweep()).toBe(0);
    expect(await ledgerHolds(key)).toBe(true);
  });

  it('keeps a key re-stamped while the sweep was reading', async () => {
    await seedDelete(LEDGER_RETENTION_MS + DAY_IN_MS);
    const load = metaStore.load.bind(metaStore);
    vi.spyOn(metaStore, 'load').mockImplementationOnce(async () => {
      const snapshot = await load();
      await metaStore.update((meta) => {
        meta.hlcs[GOAL_KEY] = hlcAgo(0);
      });
      return snapshot;
    });

    expect(await sweep()).toBe(0);
    expect((await metaStore.load()).hlcs[GOAL_KEY]).toBe(hlcAgo(0));
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
