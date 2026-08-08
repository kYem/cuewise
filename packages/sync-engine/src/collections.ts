import { DEVICE_LOCAL_SETTINGS_KEYS, logger, type Settings, storageFailure } from '@cuewise/shared';
import {
  type CollectionLock,
  getCollectionsRaw,
  getGoalsRaw,
  getQuotesRaw,
  getRemindersRaw,
  getSettingsForSync,
  getStoredSettingsKeys,
  type StorageResult,
  setCollectionsRaw,
  setGoalsRaw,
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

/**
 * Wraps a whole-array storage helper pair as a per-entity binding, keyed by `id`.
 *
 * `getAll` throwing is a refusal, and both sides keep it one: `readAll` lets it out rather than
 * reporting an empty collection the cycle would seal as a tombstone for every id, and `writeOne`
 * fails the write rather than rewriting the list from items it never saw.
 */
function arrayBinding<T extends HasId>(
  name: CollectionLock,
  getAll: () => Promise<T[]>,
  setAll: (items: T[]) => Promise<StorageResult>
): CollectionBinding {
  return {
    name,
    async readAll() {
      const items = await getAll();
      return Object.fromEntries(items.map((item) => [item.id, item]));
    },
    async writeOne(entityId, entity) {
      // Reads inside the lock: this runs in the service worker while the page writes the same array
      // from its own read, and whoever lands second carries the whole array with them. Only goals
      // has a locked page-side writer so far (`updateGoals`); the others still race.
      return withCollectionLock(name, async (): Promise<StorageResult> => {
        let items: T[];
        try {
          items = await getAll();
        } catch (error) {
          logger.error(`Could not read the ${name} collection; refusing to rewrite it`, error);
          return storageFailure(`Could not read the ${name} collection`);
        }
        if (entity === null) {
          return setAll(items.filter((item) => item.id !== entityId));
        }
        const exists = items.some((item) => item.id === entityId);
        const next = exists
          ? items.map((item) => (item.id === entityId ? (entity as T) : item))
          : [...items, entity as T];
        return setAll(next);
      });
    },
  };
}

interface SettingsEntity {
  key: string;
  value: unknown;
}

/** Per-key settings binding: each non-device-local setting is a pseudo-entity `{key, value}`. */
function settingsBinding(): CollectionBinding {
  return {
    name: 'settings',
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
    async writeOne(entityId, entity) {
      // Settings keys aren't deletable, and device-local keys never accept a synced write.
      if (entity === null) {
        return { success: true };
      }
      if (DEVICE_LOCAL_SETTINGS_KEYS.includes(entityId)) {
        return { success: true };
      }
      const { value } = entity as SettingsEntity;
      // Raw and one key: the peer may be on a version whose values ours cannot parse, and
      // refusing the write here would stall the pull cycle on that record forever.
      return setSettingsPatchRaw({ [entityId]: value } as Partial<Settings>);
    },
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
    settingsBinding(),
  ];
}
