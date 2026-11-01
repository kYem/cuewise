import {
  type KeyValueStore,
  type StorageArea,
  type StoredValues,
  storedValue,
} from '@cuewise/shared';

// Records what was written so tests can assert round-trips through the real helpers.
// Keeps the two areas apart, like chrome.storage does, so area routing is observable.
export function recordingStore(
  initial: Partial<Record<StorageArea, Record<string, unknown>>> = {}
) {
  const areas: Record<StorageArea, Record<string, unknown>> = {
    local: { ...initial.local },
    sync: { ...initial.sync },
  };
  const store: KeyValueStore = {
    supportsSync: true,
    get: async <T>(key: string, area: StorageArea) => (areas[area][key] ?? null) as T | null,
    set: async <T>(key: string, value: T, area: StorageArea) => {
      areas[area][key] = value;
      return { success: true } as const;
    },
    remove: async (key: string, area: StorageArea) => {
      delete areas[area][key];
      return true;
    },
    getMany: async (keys: string[], area: StorageArea) => {
      const result: StoredValues = {};
      for (const key of keys) {
        if (key in areas[area]) {
          result[key] = storedValue(areas[area][key]);
        }
      }
      return result;
    },
    keys: async (prefix: string, area: StorageArea) =>
      Object.keys(areas[area]).filter((key) => key.startsWith(prefix)),
    setMany: async (entries: Record<string, unknown>, area: StorageArea) => {
      Object.assign(areas[area], entries);
      return { success: true };
    },
    removeMany: async (keys: string[], area: StorageArea) => {
      for (const key of keys) {
        delete areas[area][key];
      }
      return true;
    },
    getUsage: async () => ({ bytesInUse: 0, quota: 10_000_000 }),
  };
  return { store, areas };
}

export const quotaExceeded = {
  success: false as const,
  error: { type: 'quota_exceeded' as const, message: 'Storage full' },
};
