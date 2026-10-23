import { DEVICE_LOCAL_SETTINGS_KEYS, logger, type Settings, storageFailure } from '@cuewise/shared';
import {
  type CollectionLock,
  getCollectionsRaw,
  getGoalsRaw,
  getHabitHistoryRaw,
  getQuotesRaw,
  getRemindersRaw,
  getSettingsForSync,
  getStoredSettingsKeys,
  type StorageResult,
  setCollectionsRaw,
  setGoalsRaw,
  setHabitHistoryRaw,
  setQuotesRaw,
  setRemindersRaw,
  setSettingsPatchRaw,
  withCollectionLock,
} from '@cuewise/storage';

/** One synced collection: reads all entities keyed by id, writes/deletes a single one. */
export interface CollectionBinding {
  name: string;
  readAll(): Promise<Record<string, unknown>>;
  writeOne(entityId: string, entity: unknown | null): Promise<StorageResult>;
  /** Every entry in one write, all or nothing: a null entity deletes. */
  writeMany(entities: ReadonlyMap<string, unknown | null>): Promise<StorageResult>;
  /** False where a delete is never written, so an entity missing from a listing was not purged. */
  deletable?: false;
  /**
   * Ids the enroll backfill may claim authorship of; defaults to every id readAll answers. Must
   * answer a subset of readAll's ids — an extra id pushes as a tombstone.
   */
  readBackfillIds?(): Promise<string[]>;
}

// Re-exported so existing consumers (cycle.ts, index.ts, tests) keep importing from here — the
// single source of truth now lives in @cuewise/shared so the app package can share it too.
export { DEVICE_LOCAL_SETTINGS_KEYS };

interface HasId {
  id: string;
}

// Collections already reported: readAll runs on every pull page and push, so logging on every
// call buries the stall diagnostics it sits beside.
const reportedUnusableCollections = new Set<string>();

/**
 * Wraps a whole-array storage helper pair as a per-entity binding, keyed by `id`.
 *
 * `getAll` throwing is a refusal, and both sides keep it one: `readAll` lets it out rather than
 * reporting an empty collection the cycle would seal as a tombstone for every id, and `writeOne`
 * fails the write rather than rewriting the list from items it never saw.
 *
 * Both sides read inside the lock. An unlocked `readAll` observes a page write mid-flight — the
 * quotes pair is two keys, so a quote moving between them is briefly in neither — and the cycle
 * seals that absence as a tombstone every other device applies.
 */
function arrayBinding<T extends HasId>(
  name: CollectionLock,
  getAll: () => Promise<T[]>,
  setAll: (items: T[]) => Promise<StorageResult>
): CollectionBinding {
  // Reads inside the lock: the service worker runs this while the page writes the same array
  // from its own read, so a read hoisted above the lock would erase whichever landed first.
  const writeEntities = (entities: ReadonlyMap<string, unknown | null>) =>
    withCollectionLock(name, async (): Promise<StorageResult> => {
      let items: T[];
      try {
        items = await getAll();
      } catch (error) {
        logger.error(`Could not read the ${name} collection; refusing to rewrite it`, error);
        return storageFailure(`Could not read the ${name} collection`);
      }
      // An entity already held keeps its place; a new one is appended.
      const next: T[] = [];
      const held = new Set<string>();
      for (const item of items) {
        held.add(item.id);
        const entity = entities.has(item.id) ? entities.get(item.id) : item;
        if (entity !== null) {
          next.push(entity as T);
        }
      }
      for (const [entityId, entity] of entities) {
        if (entity !== null && !held.has(entityId)) {
          next.push(entity as T);
        }
      }
      return setAll(next);
    });
  return {
    name,
    async readAll() {
      const items = await withCollectionLock(name, getAll);
      // The raw readers validate shape, not content, so `T extends HasId` is a cast rather than a
      // guarantee. An empty id pushes as an empty entityId, which the server rejects — the whole
      // batch, every cycle. A missing one keys as "undefined" and syncs a row every peer appends.
      const usable = items.filter((item) => typeof item?.id === 'string' && item.id !== '');
      if (usable.length !== items.length && !reportedUnusableCollections.has(name)) {
        reportedUnusableCollections.add(name);
        logger.error(`Skipping ${items.length - usable.length} stored ${name} with no usable id`);
      }
      return Object.fromEntries(usable.map((item) => [item.id, item]));
    },
    writeOne: (entityId, entity) => writeEntities(new Map([[entityId, entity]])),
    writeMany: writeEntities,
  };
}

interface SettingsEntity {
  key: string;
  value: unknown;
}

async function writeSettings(
  entities: ReadonlyMap<string, unknown | null>
): Promise<StorageResult> {
  const patch: Record<string, unknown> = {};
  for (const [entityId, entity] of entities) {
    // Settings keys aren't deletable, and device-local keys never accept a synced write.
    if (entity !== null && !DEVICE_LOCAL_SETTINGS_KEYS.includes(entityId)) {
      patch[entityId] = (entity as SettingsEntity).value;
    }
  }
  if (Object.keys(patch).length === 0) {
    return { success: true };
  }
  // Raw and only these keys: the peer may be on a version whose values ours cannot parse, and
  // refusing the write here would stall the pull cycle on that record forever.
  return setSettingsPatchRaw(patch as Partial<Settings>);
}

/** Per-key settings binding: each non-device-local setting is a pseudo-entity `{key, value}`. */
function settingsBinding(): CollectionBinding {
  return {
    name: 'settings',
    deletable: false,
    // Merges defaults on purpose: a key a reset just cleared is dirty, and its push must carry
    // the default the reset chose.
    async readAll() {
      const settings = await getSettingsForSync();
      const entries = Object.entries(settings).filter(
        ([key]) => !DEVICE_LOCAL_SETTINGS_KEYS.includes(key)
      );
      return Object.fromEntries(entries.map(([key, value]) => [key, { key, value }]));
    },
    // Only keys explicitly stored here: claiming the merged defaults would stamp them dirty at
    // enroll-time HLC, outranking every peer's older real choices under LWW.
    async readBackfillIds() {
      const stored = await getStoredSettingsKeys();
      return stored.filter((key) => !DEVICE_LOCAL_SETTINGS_KEYS.includes(key));
    },
    writeOne: (entityId, entity) => writeSettings(new Map([[entityId, entity]])),
    writeMany: writeSettings,
  };
}

export function defaultBindings(): CollectionBinding[] {
  return [
    // Raw readers: see the note on `getGoalsRaw`. An item the UI hides must not be an item
    // sync deletes — `writeOne` rewrites the whole array, and an entity missing from a read
    // is how the cycle infers a tombstone for every other device.
    arrayBinding('goals', getGoalsRaw, setGoalsRaw),
    arrayBinding('quotes', getQuotesRaw, setQuotesRaw),
    arrayBinding('collections', getCollectionsRaw, setCollectionsRaw),
    arrayBinding('reminders', getRemindersRaw, setRemindersRaw),
    // One entity per habit per day, so devices only conflict on a day both ticked.
    arrayBinding('habitHistory', getHabitHistoryRaw, setHabitHistoryRaw),
    settingsBinding(),
  ];
}
