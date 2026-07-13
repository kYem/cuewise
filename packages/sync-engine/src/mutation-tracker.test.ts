import { describe, expect, it } from 'vitest';
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
});
