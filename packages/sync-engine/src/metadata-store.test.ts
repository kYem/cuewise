import { describe, expect, it } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { SYNC_META_KEY, SyncMetadataStore } from './metadata-store';

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
});
