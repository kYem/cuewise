import { describe, expect, it } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { SyncMetadataStore } from './metadata-store';

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
});
