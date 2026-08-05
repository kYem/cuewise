import { logger } from '@cuewise/shared';
import { describe, expect, it, vi } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { SYNC_META_KEY, SYNC_META_QUARANTINE_KEY, SyncMetadataStore } from './metadata-store';

describe('SyncMetadataStore', () => {
  it('first load mints a stable deviceNode and default meta', async () => {
    const store = new SyncMetadataStore(new FakeKvStore());
    const a = await store.load();
    expect(a.deviceNode).toMatch(/[0-9a-f-]{36}/);
    expect(a.cursor).toBe(0);
    expect(a.dirty).toEqual({});
  });

  it('deviceNode is stable across loads (persisted)', async () => {
    const kv = new FakeKvStore();
    const first = await new SyncMetadataStore(kv).load();
    const second = await new SyncMetadataStore(kv).load();
    expect(second.deviceNode).toBe(first.deviceNode);
  });

  it('save/load round-trips a mutated meta', async () => {
    const kv = new FakeKvStore();
    const store = new SyncMetadataStore(kv);
    const meta = await store.load();
    meta.cursor = 7;
    meta.dirty = { goals: ['g1', 'g2'] };
    await store.save(meta);
    expect((await store.load()).dirty).toEqual({ goals: ['g1', 'g2'] });
  });

  it('save throws when the underlying store reports failure', async () => {
    const kv = new FakeKvStore();
    const store = new SyncMetadataStore(kv);
    const meta = await store.load();
    kv.failNextSet = true;
    await expect(store.save(meta)).rejects.toThrow();
  });

  describe('update', () => {
    // Every writer does load → mutate → save on one blob, so two that overlap must not both read
    // the same pre-state — the later save would otherwise erase the earlier one's change.
    it('serialises concurrent callers so neither change is lost', async () => {
      const store = new SyncMetadataStore(new FakeKvStore());
      await store.load();

      await Promise.all([
        store.update((meta) => {
          meta.dirty.goals = [...(meta.dirty.goals ?? []), 'g1'];
        }),
        store.update((meta) => {
          meta.dirty.goals = [...(meta.dirty.goals ?? []), 'g2'];
        }),
      ]);

      expect((await store.load()).dirty.goals).toEqual(['g1', 'g2']);
    });

    it('rejects to its own caller when the mutator throws', async () => {
      const store = new SyncMetadataStore(new FakeKvStore());

      await expect(
        store.update(() => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
    });

    it('still runs an update queued behind one whose mutator threw', async () => {
      const store = new SyncMetadataStore(new FakeKvStore());
      await store.load();

      const failing = store.update(() => {
        throw new Error('boom');
      });
      const queued = store.update((meta) => {
        meta.cursor = 9;
      });

      await expect(failing).rejects.toThrow('boom');
      await queued;
      expect((await store.load()).cursor).toBe(9);
    });

    it('leaves the stored ledger untouched when the mutator throws', async () => {
      const store = new SyncMetadataStore(new FakeKvStore());
      const meta = await store.load();
      meta.cursor = 4;
      await store.save(meta);

      await expect(
        store.update((fresh) => {
          fresh.cursor = 8;
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      expect((await store.load()).cursor).toBe(4);
    });
  });

  it('entityKey composes collection and id', () => {
    expect(SyncMetadataStore.entityKey('goals', 'g1')).toBe('goals/g1');
  });

  // A blank default saved over the real ledger orphans every pending local edit, and the
  // cleared HLCs then hand every entity to the remote on the next pull.
  it('refuses a read it could not make rather than starting as a fresh device', async () => {
    const kv = new FakeKvStore();
    const store = new SyncMetadataStore(kv);
    const first = await store.load();
    first.dirty = { goals: ['g1'] };
    await store.save(first);
    kv.failGetManyForKey = SYNC_META_KEY;

    await expect(store.load()).rejects.toThrow(/sync metadata/i);

    kv.failGetManyForKey = null;
    expect((await store.load()).dirty).toEqual({ goals: ['g1'] });
  });

  it('refuses a stored ledger it cannot read', async () => {
    const kv = new FakeKvStore();
    kv.unreadableKey = SYNC_META_KEY;

    await expect(new SyncMetadataStore(kv).load()).rejects.toThrow(/unreadable/i);
  });

  // Readable proves the bytes decoded, not that they decoded into a ledger. Handing a null back
  // as SyncMeta throws in pushOnce on `Object.keys(meta.dirty)` and takes the whole cycle down.
  it.each([
    ['null', null],
    ['a value from another shape', { cursor: 'not a number' }],
  ])('starts a fresh ledger over %s rather than handing it back', async (_label, stored) => {
    const kv = new FakeKvStore();
    await kv.set(SYNC_META_KEY, stored, 'local');
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const meta = await new SyncMetadataStore(kv).load();

    expect(meta.dirty).toEqual({});
    expect(meta.deviceNode).toMatch(/[0-9a-f-]{36}/);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ledger'), {
      key: SYNC_META_KEY,
      quarantineKey: SYNC_META_QUARANTINE_KEY,
    });
  });

  // Every other read in this codebase quarantines rather than overwrites; a ledger the shape check
  // rejected still holds the dirty set, HLCs and cursor a later build may know how to read.
  it('parks the unrecognised value under the quarantine key instead of overwriting it', async () => {
    const kv = new FakeKvStore();
    const unrecognised = { cursor: 7, dirty: { goals: ['g1'] } };
    await kv.set(SYNC_META_KEY, unrecognised, 'local');
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await new SyncMetadataStore(kv).load();

    expect(await kv.get(SYNC_META_QUARANTINE_KEY, 'local')).toEqual(unrecognised);
  });

  it('refuses to discard the unrecognised value when it cannot be quarantined', async () => {
    const kv = new FakeKvStore();
    const unrecognised = { cursor: 'not a number' };
    await kv.set(SYNC_META_KEY, unrecognised, 'local');
    kv.failSetsForKey = SYNC_META_QUARANTINE_KEY;

    await expect(new SyncMetadataStore(kv).load()).rejects.toThrow(/quarantine/i);

    expect(await kv.get(SYNC_META_KEY, 'local')).toEqual(unrecognised);
  });
});
