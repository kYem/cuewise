import {
  type KeyValueStore,
  logger,
  type StorageArea,
  type StorageResult,
  type StorageUsage,
  storageFailure,
} from '@cuewise/shared';

const LOCALSTORAGE_QUOTA_BYTES = 5242880; // 5MB (dev fallback estimate)

// localStorage signals a full store with a DOMException named QuotaExceededError
// (legacy WebKit: code 22; old Firefox: NS_ERROR_DOM_QUOTA_REACHED).
function isQuotaError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22
    );
  }
  return false;
}

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

  async set<T>(key: string, value: T, area: StorageArea): Promise<StorageResult> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return { success: true };
    } catch (error) {
      logger.error(`Error saving ${key} to storage`, error);
      // Classify quota distinctly so callers can warn precisely ("storage is
      // full") instead of offering a retry that can never succeed.
      if (isQuotaError(error)) {
        return {
          success: false,
          error: {
            type: 'quota_exceeded',
            message: `Storage is full — could not save ${key}. Clear some data to continue.`,
            key,
            area,
          },
        };
      }
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

  // Absence is decided by the raw item, not by `get`: a key stored as `null` is present, and the
  // sparse settings layout reads an omitted key as "never written, follow the default".
  //
  // A value that will not parse is not a failed read: it costs its own key, never the batch, so
  // one corrupt entry cannot reset every setting. It stays an OWN key holding `undefined`, so
  // `!== undefined` readers see "no value" while `Object.hasOwn` can still tell it from absent.
  async getMany(keys: string[], area: StorageArea): Promise<Record<string, unknown> | null> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      let item: string | null;
      try {
        item = localStorage.getItem(key);
      } catch (error) {
        logger.error(`Error getting ${key} from ${area} storage`, error);
        return null;
      }
      if (item === null) {
        continue;
      }
      try {
        result[key] = JSON.parse(item);
      } catch (error) {
        logger.error(`Ignoring an unreadable stored value for ${key} in ${area} storage`, error);
        result[key] = undefined;
      }
    }
    return result;
  }

  // Not atomic: a mid-loop quota failure leaves earlier keys in this call already written.
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
