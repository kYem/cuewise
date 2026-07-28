import { hlcEncode, hlcInit, type KeyValueStore, logger } from '@cuewise/shared';

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

/**
 * The union proves the bytes decoded, not that they decoded into a ledger: a stored `null` or a
 * shape from another build is readable and would sail through the cast, then throw on first use.
 */
function isSyncMeta(value: unknown): value is SyncMeta {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const meta = value as Partial<SyncMeta>;
  return (
    typeof meta.deviceNode === 'string' &&
    typeof meta.clock === 'string' &&
    typeof meta.cursor === 'number' &&
    typeof meta.dirty === 'object' &&
    meta.dirty !== null &&
    typeof meta.hlcs === 'object' &&
    meta.hlcs !== null &&
    Array.isArray(meta.tombstones) &&
    Array.isArray(meta.quarantine)
  );
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
      if (isSyncMeta(entry.value)) {
        return entry.value;
      }
      logger.error('The stored sync metadata is not a ledger; starting a fresh one', {
        key: SYNC_META_KEY,
      });
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
