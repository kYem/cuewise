import {
  type KeyValueStore,
  logger,
  type StorageArea,
  type StorageResult,
  type StorageUsage,
  storageFailure,
} from '@cuewise/shared';

const LOCALSTORAGE_QUOTA_BYTES = 5242880; // 5MB (dev fallback estimate)

/**
 * KeyValueStore for dev/web contexts without chrome.storage. There is a single
 * backend, so the area argument is ignored.
 */
export class LocalStorageKeyValueStore implements KeyValueStore {
  // Single localStorage backend, no separate sync area — so sync-only UI hides.
  readonly supportsSync = false;

  async get<T>(key: string, _area: StorageArea): Promise<T | null> {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      logger.error(`Error getting ${key} from storage`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, _area: StorageArea): Promise<StorageResult> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return { success: true };
    } catch (error) {
      logger.error(`Error saving ${key} to storage`, error);
      return storageFailure(`Error saving ${key} to storage`);
    }
  }

  async remove(key: string, _area: StorageArea): Promise<boolean> {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      logger.error(`Error removing ${key} from storage`, error);
      return false;
    }
  }

  async getUsage(_area: StorageArea): Promise<StorageUsage> {
    let bytesInUse = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        bytesInUse += key.length + (value?.length || 0);
      }
    }
    return { bytesInUse, quota: LOCALSTORAGE_QUOTA_BYTES };
  }
}
