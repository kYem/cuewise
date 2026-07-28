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

function areaStore(area: StorageArea): chrome.storage.StorageArea {
  return area === 'sync' ? chrome.storage.sync : chrome.storage.local;
}

/** KeyValueStore backed by chrome.storage.local/sync (selected only where it exists). */
export class ChromeKeyValueStore implements KeyValueStore {
  readonly supportsSync = true;

  async get<T>(key: string, area: StorageArea): Promise<T | null> {
    try {
      const result = await areaStore(area).get(key);
      return (result[key] as T) ?? null;
    } catch (error) {
      logger.error(`Error getting ${key} from storage`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, area: StorageArea): Promise<StorageResult> {
    try {
      await areaStore(area).set({ [key]: value });
      return { success: true };
    } catch (error) {
      return { success: false, error: toStorageError(error, key, area) };
    }
  }

  async remove(key: string, area: StorageArea): Promise<boolean> {
    try {
      await areaStore(area).remove(key);
      return true;
    } catch (error) {
      logger.error(`Error removing ${key} from storage`, error);
      return false;
    }
  }

  async getUsage(area: StorageArea): Promise<StorageUsage> {
    const bytesInUse = await areaStore(area).getBytesInUse(null);
    return { bytesInUse, quota: area === 'sync' ? SYNC_QUOTA_BYTES : LOCAL_QUOTA_BYTES };
  }

  async getMany(keys: string[], area: StorageArea): Promise<Record<string, unknown> | null> {
    try {
      const values = await areaStore(area).get(keys);
      return values;
    } catch (error) {
      logger.error('Error getting keys from storage', error);
      return null;
    }
  }

  async setMany(entries: Record<string, unknown>, area: StorageArea): Promise<StorageResult> {
    try {
      await areaStore(area).set(entries);
      return { success: true };
    } catch (error) {
      return { success: false, error: toStorageError(error, undefined, area) };
    }
  }

  async removeMany(keys: string[], area: StorageArea): Promise<boolean> {
    try {
      await areaStore(area).remove(keys);
      return true;
    } catch (error) {
      logger.error('Error removing keys from storage', error);
      return false;
    }
  }
}

/**
 * Map a thrown storage error to a typed StorageError, distinguishing Chrome's
 * quota and per-item-quota cases so callers can warn precisely.
 */
function toStorageError(error: unknown, key: string | undefined, area: StorageArea): StorageError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('QUOTA_BYTES');
  // Chrome emits 'QUOTA_BYTES_PER_ITEM quota exceeded' at runtime; keep the
  // internal symbol name as a defensive fallback.
  const isPerItemQuota =
    errorMessage.includes('QUOTA_BYTES_PER_ITEM') || errorMessage.includes('kQuotaBytesPerItem');
  // key is undefined for batch writes (setMany); describe the target generically then.
  const target = key === undefined ? 'one of the written keys' : `"${key}"`;

  if (isQuotaError && area === 'sync') {
    const errorType: StorageErrorType = isPerItemQuota
      ? 'per_item_quota_exceeded'
      : 'quota_exceeded';
    const message = isPerItemQuota
      ? `Data for ${target} exceeds the 8KB per-item limit for Chrome sync storage. Consider disabling sync or clearing old data.`
      : `Chrome sync storage quota exceeded (100KB total limit). Consider disabling sync or clearing old data.`;
    logger.error(message, error);
    return { type: errorType, message, key, area };
  }

  if (isQuotaError) {
    const message = `Chrome local storage quota exceeded for key ${target} (10MB limit). Consider clearing old data.`;
    logger.error(message, error);
    return { type: 'quota_exceeded', message, key, area };
  }

  const message = `Error saving ${target} to storage`;
  logger.error(message, error);
  return { type: 'unknown', message, key, area };
}
