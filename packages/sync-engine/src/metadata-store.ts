import { hlcEncode, hlcInit, type KeyValueStore } from '@cuewise/shared';

export const SYNC_META_KEY = 'syncMeta';

export interface SyncMeta {
  deviceNode: string;
  clock: string; // hlcEncode of the device's latest Hlc
  cursor: number; // last pulled seq
  dirty: Record<string, string[]>; // collection -> entityIds pending push
  hlcs: Record<string, string>; // "collection/entityId" -> hlcEncode
  tombstones: string[]; // "collection/entityId" that are deleted
  quarantine: string[]; // "collection/entityId" that failed decrypt
}

export function defaultMeta(deviceNode: string): SyncMeta {
  return {
    deviceNode,
    clock: hlcEncode(hlcInit(deviceNode)),
    cursor: 0,
    dirty: {},
    hlcs: {},
    tombstones: [],
    quarantine: [],
  };
}

/** The engine's private bookkeeping: dirty-set, per-entity HLCs, cursor, tombstones, quarantine. */
export class SyncMetadataStore {
  constructor(private readonly store: KeyValueStore) {}

  /**
   * Refuses rather than starting fresh when the ledger cannot be read: a blank default would be
   * saved over the real one, orphaning every pending local edit and making `localHlc === undefined`
   * hand the next pull to the remote for every entity.
   */
  async load(): Promise<SyncMeta> {
    const stored = await this.store.getMany([SYNC_META_KEY], 'local');
    if (stored === null) {
      throw new Error('Could not read the sync metadata');
    }
    const entry = stored[SYNC_META_KEY];
    if (entry !== undefined) {
      if (!entry.readable) {
        throw new Error('The stored sync metadata is unreadable');
      }
      return entry.value as SyncMeta;
    }
    const meta = defaultMeta(crypto.randomUUID());
    await this.save(meta);
    return meta;
  }

  async save(meta: SyncMeta): Promise<void> {
    const result = await this.store.set(SYNC_META_KEY, meta, 'local');
    if (!result.success) {
      throw new Error(`Failed to save sync metadata: ${result.error.message}`);
    }
  }

  static entityKey(collection: string, entityId: string): string {
    return `${collection}/${entityId}`;
  }
}
