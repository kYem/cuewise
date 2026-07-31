import {
  type KeyValueStore,
  logger,
  type StorageArea,
  type StorageChangeHandler,
  type StorageResult,
  type StorageUsage,
  type StoredValues,
  storageFailure,
  storedValue,
  UNREADABLE_VALUE,
} from '@cuewise/shared';
import { notifyStorageChange } from './notify-storage-change';

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

  private readonly subscribers = new Set<StorageChangeHandler>();

  // Emits writes made through THIS instance, because `window.onstorage` fires only for OTHER
  // documents — and here the writer (the sync engine) and the reader (a store) share one.
  onChanged(handler: StorageChangeHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  private emit(keys: string[], area: StorageArea): void {
    if (keys.length === 0) {
      return;
    }
    notifyStorageChange(this.subscribers, keys, area);
  }

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
    const result = this.writeOne(key, value, area);
    if (result.success) {
      this.emit([key], area);
    }
    return result;
  }

  private writeOne<T>(key: string, value: T, area: StorageArea): StorageResult {
    // JSON.stringify(undefined) is undefined, which localStorage keeps as the string "undefined" —
    // unparseable for every later read, and reported as a successful write.
    if (value === undefined) {
      logger.error(`Refused to store an undefined value for ${key} in ${area} storage`);
      return storageFailure(`Cannot store an undefined value for ${key}`);
    }
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

  async remove(key: string, area: StorageArea): Promise<boolean> {
    const removed = this.deleteOne(key);
    if (removed) {
      this.emit([key], area);
    }
    return removed;
  }

  private deleteOne(key: string): boolean {
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
  // one corrupt entry cannot reset every setting.
  async getMany(keys: string[], area: StorageArea): Promise<StoredValues | null> {
    const result: StoredValues = {};
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
        result[key] = storedValue(JSON.parse(item));
      } catch (error) {
        logger.error(`Found an unreadable stored value for ${key} in ${area} storage`, error);
        result[key] = UNREADABLE_VALUE;
      }
    }
    return result;
  }

  async keys(prefix: string, area: StorageArea): Promise<string[] | null> {
    try {
      const found: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          found.push(key);
        }
      }
      return found;
    } catch (error) {
      logger.error(`Error listing ${area} storage keys`, { prefix, error });
      return null;
    }
  }

  // Not atomic, and the emit is in a `finally`: a batch that fails partway still announces the
  // keys that did land.
  async setMany(entries: Record<string, unknown>, area: StorageArea): Promise<StorageResult> {
    const written: string[] = [];
    try {
      for (const [key, value] of Object.entries(entries)) {
        const result = this.writeOne(key, value, area);
        if (!result.success) {
          return result;
        }
        written.push(key);
      }
      return { success: true };
    } finally {
      this.emit(written, area);
    }
  }

  // No try/finally, unlike setMany: nothing here returns early, and neither deleteOne nor emit
  // can throw past this loop.
  async removeMany(keys: string[], area: StorageArea): Promise<boolean> {
    const removed: string[] = [];
    for (const key of keys) {
      if (this.deleteOne(key)) {
        removed.push(key);
      }
    }
    this.emit(removed, area);
    return removed.length === keys.length;
  }
}
