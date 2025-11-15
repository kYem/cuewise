/**
 * Chrome Storage API adapter for browser extensions
 */

import type { StorageAdapter } from '../storage-interface';

type StorageArea = 'local' | 'sync';

export class ChromeStorageAdapter implements StorageAdapter {
  constructor(private area: StorageArea = 'local') {}

  private get storage() {
    return this.area === 'local' ? chrome.storage.local : chrome.storage.sync;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.storage.get(key);
      return (result[key] as T) ?? null;
    } catch (error) {
      console.error(`Error getting ${key} from Chrome storage:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    try {
      await this.storage.set({ [key]: value });
      return true;
    } catch (error) {
      console.error(`Error setting ${key} in Chrome storage:`, error);
      return false;
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      await this.storage.remove(key);
      return true;
    } catch (error) {
      console.error(`Error removing ${key} from Chrome storage:`, error);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      await this.storage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing Chrome storage:', error);
      return false;
    }
  }

  onChange(callback: (changes: Record<string, any>) => void): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === this.area) {
        callback(changes);
      }
    });
  }

  removeChangeListener(callback: (changes: Record<string, any>) => void): void {
    chrome.storage.onChanged.removeListener(callback as any);
  }
}
