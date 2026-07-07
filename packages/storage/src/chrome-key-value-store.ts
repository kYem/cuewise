import {
  type KeyValueStore,
  logger,
  type StorageArea,
  type StorageError,
  type StorageErrorType,
  type StorageResult,
  type StorageUsage,
} from '@cuewise/shared';

// Chrome storage quotas
const SYNC_QUOTA_BYTES = 102400; // 100KB
const LOCAL_QUOTA_BYTES = 10485760; // 10MB
const LOCALSTORAGE_QUOTA_BYTES = 5242880; // 5MB (dev fallback estimate)

/**
 * KeyValueStore backed by chrome.storage.local/sync, falling back to
 * localStorage in dev/web contexts where chrome.storage is unavailable.
 */
export class ChromeKeyValueStore implements KeyValueStore {
  async get<T>(key: string, area: StorageArea): Promise<T | null> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const storage = area === 'local' ? chrome.storage.local : chrome.storage.sync;
        const result = await storage.get(key);
        return (result[key] as T) ?? null;
      }
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      logger.error(`Error getting ${key} from storage`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, area: StorageArea): Promise<StorageResult> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const storage = area === 'local' ? chrome.storage.local : chrome.storage.sync;
        await storage.set({ [key]: value });
        return { success: true };
      }
      localStorage.setItem(key, JSON.stringify(value));
      return { success: true };
    } catch (error) {
      return { success: false, error: toStorageError(error, key, area) };
    }
  }

  async remove(key: string, area: StorageArea): Promise<boolean> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const storage = area === 'local' ? chrome.storage.local : chrome.storage.sync;
        await storage.remove(key);
        return true;
      }
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      logger.error(`Error removing ${key} from storage`, error);
      return false;
    }
  }

  async getUsage(area: StorageArea): Promise<StorageUsage> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
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

    const storage = area === 'sync' ? chrome.storage.sync : chrome.storage.local;
    const bytesInUse = await new Promise<number>((resolve) => {
      storage.getBytesInUse(null, (bytes) => {
        resolve(bytes);
      });
    });
    return { bytesInUse, quota: area === 'sync' ? SYNC_QUOTA_BYTES : LOCAL_QUOTA_BYTES };
  }
}

/**
 * Map a thrown storage error to a typed StorageError, distinguishing Chrome's
 * quota and per-item-quota cases so callers can warn precisely.
 */
function toStorageError(error: unknown, key: string, area: StorageArea): StorageError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('QUOTA_BYTES');
  const isPerItemQuota = errorMessage.includes('kQuotaBytesPerItem');

  if (isQuotaError && area === 'sync') {
    const errorType: StorageErrorType = isPerItemQuota
      ? 'per_item_quota_exceeded'
      : 'quota_exceeded';
    const message = isPerItemQuota
      ? `Data for "${key}" exceeds the 8KB per-item limit for Chrome sync storage. Consider disabling sync or clearing old data.`
      : `Chrome sync storage quota exceeded (100KB total limit). Consider disabling sync or clearing old data.`;
    logger.error(message, error);
    return { type: errorType, message, key, area };
  }

  if (isQuotaError) {
    const message = `Chrome local storage quota exceeded for key "${key}" (10MB limit). Consider clearing old data.`;
    logger.error(message, error);
    return { type: 'quota_exceeded', message, key, area };
  }

  const message = `Error saving ${key} to storage`;
  logger.error(message, error);
  return { type: 'unknown', message, key, area };
}
