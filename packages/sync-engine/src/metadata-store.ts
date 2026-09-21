import { hlcEncode, hlcInit, type KeyValueStore, logger } from '@cuewise/shared';

export const SYNC_META_KEY = 'syncMeta';
/** Where a stored value that is readable but not a ledger is parked before a fresh one replaces it. */
export const SYNC_META_QUARANTINE_KEY = 'syncMeta.quarantined';

export interface SyncMeta {
  deviceNode: string;
  clock: string; // hlcEncode of the device's latest Hlc
  cursor: number; // last pulled seq
  dirty: Record<string, string[]>; // collection -> entityIds pending push
  hlcs: Record<string, string>; // "collection/entityId" -> hlcEncode
  seqs: Record<string, number>; // "collection/entityId" -> highest server seq seen, less failed writes
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
    seqs: {},
    tombstones: [],
    quarantine: [],
  };
}

/** A ledger as persisted: one written before `seqs` existed carries no map. */
type StoredSyncMeta = Omit<SyncMeta, 'seqs'> & { seqs?: unknown };

/**
 * `readable` proves the bytes decoded, not that they decoded into a ledger: a stored `null` or a
 * shape from another build sails through the cast, then throws on `Object.keys(meta.dirty)`.
 */
function isStoredSyncMeta(value: unknown): value is StoredSyncMeta {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const meta = value as Partial<StoredSyncMeta>;
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

/** What the server assigns rows and what it accepts as a base; anything else refuses a whole push. */
export function isServerSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

// An absent map or entry means "no seq known", so the entity pushes as a row the server has not got.
function withSeqs(meta: StoredSyncMeta): SyncMeta {
  const seqs: Record<string, number> = {};
  if (typeof meta.seqs === 'object' && meta.seqs !== null) {
    let dropped = 0;
    for (const [key, value] of Object.entries(meta.seqs)) {
      if (isServerSeq(value)) {
        seqs[key] = value;
      } else {
        dropped += 1;
      }
    }
    if (dropped > 0) {
      logger.warn(`Dropped ${dropped} stored sync seq(s) that were not seqs`);
    }
  }
  return { ...meta, seqs };
}

/** The engine's bookkeeping: dirty set, per-entity hlcs/seqs, cursor, tombstones, quarantine. */
export class SyncMetadataStore {
  // Tail of the serialised update queue; see `update`.
  private chain: Promise<void> = Promise.resolve();

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
      if (isStoredSyncMeta(entry.value)) {
        return withSeqs(entry.value);
      }
      await this.quarantineUnrecognised(entry.value);
    }
    const meta = defaultMeta(crypto.randomUUID());
    await this.save(meta);
    return meta;
  }

  /**
   * Parked, not overwritten: the fresh ledger about to replace it would otherwise discard whatever
   * dirty set, HLCs, seqs, cursor, tombstones and quarantine list the stored value was carrying.
   */
  private async quarantineUnrecognised(value: unknown): Promise<void> {
    const result = await this.store.set(SYNC_META_QUARANTINE_KEY, value, 'local');
    if (!result.success) {
      throw new Error(
        `Failed to quarantine the unrecognised sync metadata: ${result.error.message}`
      );
    }
    logger.error(
      'The stored sync metadata is not a ledger; quarantined it and starting a fresh one',
      {
        key: SYNC_META_KEY,
        quarantineKey: SYNC_META_QUARANTINE_KEY,
      }
    );
  }

  async save(meta: SyncMeta): Promise<void> {
    const result = await this.store.set(SYNC_META_KEY, meta, 'local');
    if (!result.success) {
      throw new Error(`Failed to save sync metadata: ${result.error.message}`);
    }
  }

  /**
   * The only safe way to change the ledger: loads fresh, applies `mutator`, saves — queued behind
   * any update still running. Every writer works on one whole blob, so two that each load → mutate
   * → save around a network round trip would otherwise have the later save erase the earlier's.
   */
  async update(mutator: (meta: SyncMeta) => void): Promise<void> {
    const run = this.chain.then(async () => {
      const meta = await this.load();
      mutator(meta);
      await this.save(meta);
    });
    // The queue tracks a settled run, not a rejected one: one failed mutator must not wedge it.
    this.chain = run.catch(() => {});
    return run;
  }

  static entityKey(collection: string, entityId: string): string {
    return `${collection}/${entityId}`;
  }
}
