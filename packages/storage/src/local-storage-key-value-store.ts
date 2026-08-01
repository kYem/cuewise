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

type RemoveOutcome = 'removed' | 'absent' | 'failed';

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
    const outcome = this.deleteOne(key);
    if (outcome === 'removed') {
      this.emit([key], area);
    }
    return outcome !== 'failed';
  }

  // 'absent' apart from 'removed': removing an absent key succeeds (the port calls it idempotent)
  // but changes nothing, and announcing it queues a re-read for a write that never happened.
  private deleteOne(key: string): RemoveOutcome {
    try {
      const existed = localStorage.getItem(key) !== null;
      localStorage.removeItem(key);
      return existed ? 'removed' : 'absent';
    } catch (error) {
      logger.error(`Error removing ${key} from storage`, error);
      return 'failed';
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

  // Not atomic: a batch that stops partway still announces the keys that did land. The emit is in
  // a `finally` and the return outside it, so neither a throw nor the emit can lose the other.
  async setMany(entries: Record<string, unknown>, area: StorageArea): Promise<StorageResult> {
    const written: string[] = [];
    let failure: StorageResult | null = null;
    try {
      for (const [key, value] of Object.entries(entries)) {
        const result = this.writeOne(key, value, area);
        if (!result.success) {
          failure = result;
          break;
        }
        written.push(key);
      }
    } finally {
      this.emit(written, area);
    }
    return failure ?? { success: true };
  }

  async removeMany(keys: string[], area: StorageArea): Promise<boolean> {
    const changed: string[] = [];
    let allRemoved = true;
    for (const key of keys) {
      const outcome = this.deleteOne(key);
      if (outcome === 'failed') {
        allRemoved = false;
      }
      if (outcome === 'removed') {
        changed.push(key);
      }
    }
    this.emit(changed, area);
    return allRemoved;
  }
}
