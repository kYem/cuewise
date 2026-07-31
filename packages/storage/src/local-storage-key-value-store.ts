import {
  type KeyValueStore,
  logger,
  type StorageArea,
  type StorageResult,
  type StorageUsage,
  type StoredValues,
  storageFailure,
  storedValue,
  UNREADABLE_VALUE,
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

  private readonly subscribers = new Set<(keys: string[], area: StorageArea) => void>();

  /**
   * Emits writes made through THIS instance. `window.onstorage` fires only for other documents,
   * so a same-document write it does not emit is one nobody sees — even though the writer (the
   * sync engine) and the reader (a store) share the realm. Writes from another document, or
   * straight to `localStorage`, are not observed at all.
   */
  onChanged(handler: (keys: string[], area: StorageArea) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  // Collects while a batch is open, so one setMany is one notification rather than one per key —
  // every subscriber re-reads on each. Depth, not a flag, and keyed by area: overlapping batches
  // must merge, since a second one replacing the collector drops what the first had gathered.
  private batchDepth = 0;
  private batchedKeys = new Map<StorageArea, string[]>();

  // A throwing subscriber must not fail the write that notified it.
  private emit(keys: string[], area: StorageArea): void {
    if (this.batchDepth > 0) {
      const pending = this.batchedKeys.get(area) ?? [];
      pending.push(...keys);
      this.batchedKeys.set(area, pending);
      return;
    }
    if (keys.length === 0) {
      return;
    }
    for (const subscriber of this.subscribers) {
      try {
        // Typed `=> void`, but a caller can still hand back a promise, and every subscriber this
        // ships today is async — a rejection a sync catch cannot see would escape unhandled.
        const settled = subscriber(keys, area) as unknown;
        if (settled instanceof Promise) {
          settled.catch((error) => {
            logger.error('A storage change subscriber rejected', { keys, area, error });
          });
        }
      } catch (error) {
        logger.error('A storage change subscriber threw', { keys, area, error });
      }
    }
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
    // JSON.stringify(undefined) is undefined, which localStorage keeps as the string "undefined" —
    // unparseable for every later read, and reported as a successful write.
    if (value === undefined) {
      logger.error(`Refused to store an undefined value for ${key} in ${area} storage`);
      return storageFailure(`Cannot store an undefined value for ${key}`);
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.emit([key], area);
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
    try {
      localStorage.removeItem(key);
      this.emit([key], area);
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

  // Not atomic: a mid-loop quota failure leaves earlier keys in this call already written.
  async setMany(entries: Record<string, unknown>, area: StorageArea): Promise<StorageResult> {
    this.batchDepth += 1;
    try {
      for (const [key, value] of Object.entries(entries)) {
        const result = await this.set(key, value, area);
        if (!result.success) {
          return result;
        }
      }
      return { success: true };
    } finally {
      this.flush();
    }
  }

  async removeMany(keys: string[], area: StorageArea): Promise<boolean> {
    this.batchDepth += 1;
    try {
      let allRemoved = true;
      for (const key of keys) {
        const removed = await this.remove(key, area);
        if (!removed) {
          allRemoved = false;
        }
      }
      return allRemoved;
    } finally {
      this.flush();
    }
  }

  // Only the outermost batch emits, so overlapping ones report together rather than one cancelling
  // the other. Per area, because a consumer that filters on it must not see another area's keys.
  private flush(): void {
    this.batchDepth -= 1;
    if (this.batchDepth > 0) {
      return;
    }
    const batches = [...this.batchedKeys];
    this.batchedKeys.clear();
    for (const [area, keys] of batches) {
      this.emit(keys, area);
    }
  }
}
