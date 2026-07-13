import { hlcDecode, hlcEncode, hlcNow } from '@cuewise/shared';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';

/** Turns a "this entity changed" signal into dirty-set + per-entity HLC bookkeeping. */
export class MutationTracker {
  constructor(
    private readonly meta: SyncMetadataStore,
    private readonly now: () => number = Date.now
  ) {}

  async markMutated(collection: string, entityId: string): Promise<void> {
    const meta = await this.meta.load();
    const key = this.stamp(meta, collection, entityId);
    const tombstoneIndex = meta.tombstones.indexOf(key);
    if (tombstoneIndex !== -1) {
      meta.tombstones.splice(tombstoneIndex, 1);
    }
    await this.meta.save(meta);
  }

  async markDeleted(collection: string, entityId: string): Promise<void> {
    const meta = await this.meta.load();
    const key = this.stamp(meta, collection, entityId);
    if (!meta.tombstones.includes(key)) {
      meta.tombstones.push(key);
    }
    await this.meta.save(meta);
  }

  // Shared by both methods: advance the device clock, stamp the entity's hlc, mark it dirty.
  private stamp(meta: SyncMeta, collection: string, entityId: string): string {
    const next = hlcNow(hlcDecode(meta.clock), this.now());
    meta.clock = hlcEncode(next);
    const key = SyncMetadataStore.entityKey(collection, entityId);
    meta.hlcs[key] = meta.clock;
    if (meta.dirty[collection] === undefined) {
      meta.dirty[collection] = [];
    }
    if (!meta.dirty[collection].includes(entityId)) {
      meta.dirty[collection].push(entityId);
    }
    return key;
  }
}
