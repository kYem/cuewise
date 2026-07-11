import type { KeyValueStore, Scheduler, StorageArea, StorageUsage } from '@cuewise/shared';

/** Map-backed KeyValueStore for tests; `set` succeeds unless `failWrites` is set. */
export function createInMemoryKeyValueStore(
  opts: { failWrites?: boolean; supportsSync?: boolean } = {}
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
    async remove(key: string, area: StorageArea): Promise<boolean> {
      return data.delete(`${area}:${key}`);
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
