import { DEVICE_LOCAL_SETTINGS_KEYS, type Settings } from '@cuewise/shared';
import {
  getCollections,
  getGoals,
  getQuotes,
  getReminders,
  getSettings,
  type StorageResult,
  setCollections,
  setGoals,
  setQuotes,
  setReminders,
  setSettings,
} from '@cuewise/storage';

/** One synced collection: reads all entities keyed by id, writes/deletes a single one. */
export interface CollectionBinding {
  name: string;
  readAll(): Promise<Record<string, unknown>>;
  writeOne(entityId: string, entity: unknown | null): Promise<StorageResult>;
}

// Re-exported so existing consumers (cycle.ts, index.ts, tests) keep importing from here — the
// single source of truth now lives in @cuewise/shared so the app package can share it too.
export { DEVICE_LOCAL_SETTINGS_KEYS };

interface HasId {
  id: string;
}

/** Wraps a whole-array storage helper pair as a per-entity binding, keyed by `id`. */
function arrayBinding<T extends HasId>(
  name: string,
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
      const items = await getAll();
      if (entity === null) {
        return setAll(items.filter((item) => item.id !== entityId));
      }
      const exists = items.some((item) => item.id === entityId);
      const next = exists
        ? items.map((item) => (item.id === entityId ? (entity as T) : item))
        : [...items, entity as T];
      return setAll(next);
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
    async readAll() {
      const settings = await getSettings();
      const entries = Object.entries(settings).filter(
        ([key]) => !DEVICE_LOCAL_SETTINGS_KEYS.includes(key)
      );
      return Object.fromEntries(entries.map(([key, value]) => [key, { key, value }]));
    },
    async writeOne(entityId, entity) {
      // Settings keys aren't deletable, and device-local keys never accept a synced write.
      if (entity === null) {
        return { success: true };
      }
      if (DEVICE_LOCAL_SETTINGS_KEYS.includes(entityId)) {
        return { success: true };
      }
      const settings = await getSettings();
      const { value } = entity as SettingsEntity;
      const next: Settings = { ...settings, [entityId]: value };
      return setSettings(next);
    },
  };
}

export function defaultBindings(): CollectionBinding[] {
  return [
    arrayBinding('goals', getGoals, setGoals),
    arrayBinding('quotes', getQuotes, setQuotes),
    arrayBinding('collections', getCollections, setCollections),
    arrayBinding('reminders', getReminders, setReminders),
    settingsBinding(),
  ];
}
