import { describe, expect, it, vi } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { SyncMetadataStore } from './metadata-store';
import { MutationTracker } from './mutation-tracker';

describe('MutationTracker', () => {
  it('markMutated adds the entity to the dirty set and stamps its hlc', async () => {
    const meta = new SyncMetadataStore(new FakeKvStore());
    const tracker = new MutationTracker(meta, () => 1000);
    await tracker.markMutated('goals', 'g1');
    const saved = await meta.load();
    expect(saved.dirty.goals).toEqual(['g1']);
    expect(saved.hlcs['goals/g1']).toBeDefined();
  });

  it('repeated markMutated calls dedupe the dirty entry and advance the hlc', async () => {
    const meta = new SyncMetadataStore(new FakeKvStore());
    let now = 1000;
    const tracker = new MutationTracker(meta, () => now);
    await tracker.markMutated('goals', 'g1');
    const first = (await meta.load()).hlcs['goals/g1'];
    now = 2000;
    await tracker.markMutated('goals', 'g1');
    const saved = await meta.load();
    expect(saved.dirty.goals).toEqual(['g1']);
    expect(saved.hlcs['goals/g1'] > first).toBe(true);
  });

  it('markDeleted adds the entity to dirty and its key to tombstones', async () => {
    const meta = new SyncMetadataStore(new FakeKvStore());
    const tracker = new MutationTracker(meta, () => 1000);
    await tracker.markDeleted('goals', 'g2');
    const saved = await meta.load();
    expect(saved.dirty.goals).toEqual(['g2']);
    expect(saved.tombstones).toContain('goals/g2');
  });

  it('markMutated after markDeleted clears the tombstone and keeps the entity dirty', async () => {
    const meta = new SyncMetadataStore(new FakeKvStore());
    const tracker = new MutationTracker(meta, () => 1000);
    await tracker.markDeleted('goals', 'g3');
    await tracker.markMutated('goals', 'g3');
    const saved = await meta.load();
    expect(saved.dirty.goals).toEqual(['g3']);
    expect(saved.tombstones).not.toContain('goals/g3');
  });

  describe('markMutatedBulk', () => {
    it('marks every id dirty with distinct advancing hlcs in a single save', async () => {
      const kv = new FakeKvStore();
      const meta = new SyncMetadataStore(kv);
      // Warm the store (load() lazily creates + saves default meta) before spying, so the
      // spy only sees the save this test cares about.
      await meta.load();
      const setSpy = vi.spyOn(kv, 'set');
      let now = 1000;
      const tracker = new MutationTracker(meta, () => now++);

      await tracker.markMutatedBulk('goals', ['a', 'b', 'c']);

      const saved = await meta.load();
      expect(saved.dirty.goals).toEqual(['a', 'b', 'c']);
      const hlcs = ['a', 'b', 'c'].map((id) => saved.hlcs[`goals/${id}`]);
      expect(hlcs.every((hlc) => hlc !== undefined)).toBe(true);
      expect(new Set(hlcs).size).toBe(3);
      expect(hlcs[0] < hlcs[1]).toBe(true);
      expect(hlcs[1] < hlcs[2]).toBe(true);
      // One save for the whole batch, not one per id.
      expect(setSpy).toHaveBeenCalledTimes(1);
    });

    it('dedupes a repeated id instead of adding it twice to dirty', async () => {
      const meta = new SyncMetadataStore(new FakeKvStore());
      const tracker = new MutationTracker(meta, () => 1000);

      await tracker.markMutatedBulk('goals', ['a', 'b', 'a']);

      const saved = await meta.load();
      expect(saved.dirty.goals).toEqual(['a', 'b']);
    });

    it('clears tombstones for ids that were previously deleted', async () => {
      const meta = new SyncMetadataStore(new FakeKvStore());
      const tracker = new MutationTracker(meta, () => 1000);
      await tracker.markDeleted('goals', 'a');

      await tracker.markMutatedBulk('goals', ['a', 'b']);

      const saved = await meta.load();
      expect(saved.tombstones).not.toContain('goals/a');
      expect(saved.dirty.goals).toEqual(['a', 'b']);
    });
  });
});
