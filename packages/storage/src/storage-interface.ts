/**
 * Platform-agnostic storage interface
 * Implementations: Chrome Storage API, localStorage, AsyncStorage (React Native)
 */

/**
 * Represents a change to a storage value
 */
export interface StorageChange<T = unknown> {
  oldValue?: T;
  newValue?: T;
}

/**
 * Map of storage keys to their changes
 */
export type StorageChanges = Record<string, StorageChange>;

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  clear(): Promise<boolean>;
  onChange?(callback: (changes: StorageChanges) => void): void;
  removeChangeListener?(callback: (changes: StorageChanges) => void): void;
}

/**
 * Storage manager that uses the provided adapter
 */
export class StorageManager {
  constructor(private adapter: StorageAdapter) {}

  async get<T>(key: string): Promise<T | null> {
    return this.adapter.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    return this.adapter.set(key, value);
  }

  async remove(key: string): Promise<boolean> {
    return this.adapter.remove(key);
  }

  async clear(): Promise<boolean> {
    return this.adapter.clear();
  }

  onChange(callback: (changes: StorageChanges) => void): void {
    if (this.adapter.onChange) {
      this.adapter.onChange(callback);
    }
  }

  removeChangeListener(callback: (changes: StorageChanges) => void): void {
    if (this.adapter.removeChangeListener) {
      this.adapter.removeChangeListener(callback);
    }
  }
}
