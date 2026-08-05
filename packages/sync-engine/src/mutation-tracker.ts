import { hlcDecode, hlcEncode, hlcNow } from '@cuewise/shared';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';

/** Turns a "this entity changed" signal into dirty-set + per-entity HLC bookkeeping. */
export class MutationTracker {
  constructor(
    private readonly meta: SyncMetadataStore,
    private readonly now: () => number = Date.now
  ) {}

  async markMutated(collection: string, entityId: string): Promise<void> {
    await this.meta.update((meta) => {
      const key = this.stamp(meta, collection, entityId);
      const tombstoneIndex = meta.tombstones.indexOf(key);
      if (tombstoneIndex !== -1) {
        meta.tombstones.splice(tombstoneIndex, 1);
      }
    });
  }

  /** Same as markMutated, but loads/saves meta ONCE for the whole batch instead of per-id. */
  async markMutatedBulk(collection: string, entityIds: string[]): Promise<void> {
    await this.meta.update((meta) => {
      for (const entityId of entityIds) {
        const key = this.stamp(meta, collection, entityId);
        const tombstoneIndex = meta.tombstones.indexOf(key);
        if (tombstoneIndex !== -1) {
          meta.tombstones.splice(tombstoneIndex, 1);
        }
      }
    });
  }

  async markDeleted(collection: string, entityId: string): Promise<void> {
    await this.meta.update((meta) => {
      const key = this.stamp(meta, collection, entityId);
      if (!meta.tombstones.includes(key)) {
        meta.tombstones.push(key);
      }
    });
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
