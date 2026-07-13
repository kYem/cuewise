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

  async load(): Promise<SyncMeta> {
    const existing = await this.store.get<SyncMeta>(SYNC_META_KEY, 'local');
    if (existing !== null) {
      return existing;
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
