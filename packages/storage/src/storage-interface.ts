/**
 * Platform-agnostic storage interface
 * Implementations: Chrome Storage API, localStorage, AsyncStorage (React Native)
 */

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  clear(): Promise<boolean>;
  onChange?(callback: (changes: Record<string, any>) => void): void;
  removeChangeListener?(callback: (changes: Record<string, any>) => void): void;
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

  onChange(callback: (changes: Record<string, any>) => void): void {
    if (this.adapter.onChange) {
      this.adapter.onChange(callback);
    }
  }

  removeChangeListener(callback: (changes: Record<string, any>) => void): void {
    if (this.adapter.removeChangeListener) {
      this.adapter.removeChangeListener(callback);
    }
  }
}
