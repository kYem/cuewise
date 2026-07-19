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
}
