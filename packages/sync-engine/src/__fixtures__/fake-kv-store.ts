import {
  type KeyValueStore,
  type StorageArea,
  type StorageResult,
  type StorageUsage,
  storageFailure,
} from '@cuewise/shared';

/** Map-backed KeyValueStore fake for engine tests; `failNextSet` simulates a quota failure once. */
export class FakeKvStore implements KeyValueStore {
  // Single Map backend, area ignored — matches LocalStorageKeyValueStore's `false`, not chrome.storage.
  readonly supportsSync = false;
  failNextSet = false;
  /** While set, every write to exactly this key fails — for targeting one write among many. */
  failSetsForKey: string | null = null;
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string, _area: StorageArea): Promise<T | null> {
    // Clone on read like the real serialize-on-write backends, so a mutated read can't persist without set().
    return this.data.has(key) ? (structuredClone(this.data.get(key)) as T) : null;
  }

  async set<T>(key: string, value: T, _area: StorageArea): Promise<StorageResult> {
    if (this.failNextSet) {
      this.failNextSet = false;
      return storageFailure('quota exceeded');
    }
    if (this.failSetsForKey === key) {
      return storageFailure('quota exceeded');
    }
    this.data.set(key, structuredClone(value));
    return { success: true };
  }

  async remove(key: string, _area: StorageArea): Promise<boolean> {
    return this.data.delete(key);
  }

  async getUsage(_area: StorageArea): Promise<StorageUsage> {
    return { bytesInUse: 0, quota: 0 };
  }

  async getMany(keys: string[], area: StorageArea): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const value = await this.get(key, area);
      if (value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  // Routes through set() so failNextSet / failSetsForKey still apply to batch writes.
  async setMany(entries: Record<string, unknown>, area: StorageArea): Promise<StorageResult> {
    for (const [key, value] of Object.entries(entries)) {
      const result = await this.set(key, value, area);
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  }

  async removeMany(keys: string[], area: StorageArea): Promise<boolean> {
    let allRemoved = true;
    for (const key of keys) {
      const removed = await this.remove(key, area);
      if (!removed) {
        allRemoved = false;
      }
    }
    return allRemoved;
  }
}
