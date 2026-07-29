import {
  type KeyValueStore,
  type StorageArea,
  type StorageResult,
  type StorageUsage,
  type StoredValues,
  storageFailure,
  storedValue,
  UNREADABLE_VALUE,
} from '@cuewise/shared';

/** Map-backed KeyValueStore fake for engine tests; `failNextSet` simulates a quota failure once. */
export class FakeKvStore implements KeyValueStore {
  // Single Map backend, area ignored — matches LocalStorageKeyValueStore's `false`, not chrome.storage.
  readonly supportsSync = false;
  failNextSet = false;
  /** While set, every write to exactly this key fails — for targeting one write among many. */
  failSetsForKey: string | null = null;
  /** While set, writes to this key reject outright, as a faulty adapter would. */
  throwSetsForKey: string | null = null;
  /** While set, a batch read naming exactly this key reports failure instead of absence. */
  failGetManyForKey: string | null = null;
  /** While set, this key reads back as stored-but-unreadable. */
  unreadableKey: string | null = null;
  failKeys = false;
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
    if (this.throwSetsForKey === key) {
      throw new Error(`FakeKvStore: simulated adapter fault writing ${key}`);
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

  async getMany(keys: string[], _area: StorageArea): Promise<StoredValues | null> {
    if (this.failGetManyForKey !== null && keys.includes(this.failGetManyForKey)) {
      return null;
    }
    const result: StoredValues = {};
    for (const key of keys) {
      if (this.unreadableKey === key) {
        result[key] = UNREADABLE_VALUE;
      } else if (this.data.has(key)) {
        result[key] = storedValue(structuredClone(this.data.get(key)));
      }
    }
    return result;
  }

  async keys(prefix: string, _area: StorageArea): Promise<string[] | null> {
    if (this.failKeys) {
      return null;
    }
    return [...this.data.keys()].filter((key) => key.startsWith(prefix));
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

  async removeMany(keys: string[], _area: StorageArea): Promise<boolean> {
    for (const key of keys) {
      this.data.delete(key);
    }
    return true;
  }
}
