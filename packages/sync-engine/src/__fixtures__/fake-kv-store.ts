import {
  type KeyValueStore,
  type StorageArea,
  type StorageResult,
  type StorageUsage,
  storageFailure,
} from '@cuewise/shared';

/** Map-backed KeyValueStore fake for engine tests; `failNextSet` simulates a quota failure once. */
export class FakeKvStore implements KeyValueStore {
  readonly supportsSync = true;
  failNextSet = false;
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string, _area: StorageArea): Promise<T | null> {
    return this.data.has(key) ? (this.data.get(key) as T) : null;
  }

  async set<T>(key: string, value: T, _area: StorageArea): Promise<StorageResult> {
    if (this.failNextSet) {
      this.failNextSet = false;
      return storageFailure('quota exceeded');
    }
    this.data.set(key, value);
    return { success: true };
  }

  async remove(key: string, _area: StorageArea): Promise<boolean> {
    return this.data.delete(key);
  }

  async getUsage(_area: StorageArea): Promise<StorageUsage> {
    return { bytesInUse: 0, quota: 0 };
  }
}
