import {
  type KeyValueStore,
  type Scheduler,
  type StorageArea,
  type StorageUsage,
  type StoredValues,
  storedValue,
} from '@cuewise/shared';

/** Map-backed KeyValueStore for tests; writes and removes succeed unless told to fail. */
export function createInMemoryKeyValueStore(
  opts: { failWrites?: boolean; failRemoves?: boolean; supportsSync?: boolean } = {}
): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();

  return {
    data,
    supportsSync: opts.supportsSync ?? false,
    async get<T>(key: string, area: StorageArea): Promise<T | null> {
      const value = data.get(`${area}:${key}`);
      if (value === undefined) {
        return null;
      }
      return value as T;
    },
    async set<T>(key: string, value: T, area: StorageArea) {
      if (opts.failWrites === true) {
        return {
          success: false,
          error: { type: 'quota_exceeded', message: 'simulated quota failure' },
        } as const;
      }
      data.set(`${area}:${key}`, value);
      return { success: true } as const;
    },
    // Idempotent like the real adapters: removing an absent key SUCCEEDS. Answering Map.delete
    // here reported "nothing to remove" as a surviving value, which is how a caller learns a
    // credential outlived its account.
    async remove(key: string, area: StorageArea): Promise<boolean> {
      if (opts.failRemoves === true) {
        return false;
      }
      data.delete(`${area}:${key}`);
      return true;
    },
    async getMany(keys: string[], area: StorageArea): Promise<StoredValues> {
      const result: StoredValues = {};
      for (const key of keys) {
        const value = data.get(`${area}:${key}`);
        if (value !== undefined) {
          result[key] = storedValue(value);
        }
      }
      return result;
    },
    async keys(prefix: string, area: StorageArea): Promise<string[]> {
      return [...data.keys()]
        .filter((key) => key.startsWith(`${area}:`))
        .map((key) => key.slice(area.length + 1))
        .filter((key) => key.startsWith(prefix));
    },
    async setMany(entries: Record<string, unknown>, area: StorageArea) {
      if (opts.failWrites === true) {
        return {
          success: false,
          error: { type: 'quota_exceeded', message: 'simulated quota failure' },
        } as const;
      }
      for (const [key, value] of Object.entries(entries)) {
        data.set(`${area}:${key}`, value);
      }
      return { success: true } as const;
    },
    async removeMany(keys: string[], area: StorageArea): Promise<boolean> {
      for (const key of keys) {
        data.delete(`${area}:${key}`);
      }
      return true;
    },
    async getUsage(_area: StorageArea): Promise<StorageUsage> {
      return { bytesInUse: 0, quota: 0 };
    },
  };
}

/** Recording Scheduler for tests; every scheduleAt call is captured, nothing fires. */
export function createRecordingScheduler(): Scheduler & {
  scheduled: Array<{ id: string; when: Date }>;
} {
  const scheduled: Array<{ id: string; when: Date }> = [];

  return {
    deliversInBackground: false,
    persistsAcrossRestarts: false,
    scheduled,
    async scheduleAt(id: string, when: Date): Promise<void> {
      scheduled.push({ id, when });
    },
    async cancel(_id: string): Promise<void> {},
  };
}
