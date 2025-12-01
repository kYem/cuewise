/**
 * Chrome Storage API adapter for browser extensions
 */

import { logger } from '@cuewise/shared';
import type { StorageAdapter, StorageChanges } from '../storage-interface';

type StorageArea = 'local' | 'sync';

export class ChromeStorageAdapter implements StorageAdapter {
  private listenerMap = new WeakMap<
    (changes: StorageChanges) => void,
    (changes: chrome.storage.StorageChange, areaName: string) => void
  >();

  constructor(private area: StorageArea = 'local') {}

  private get storage() {
    return this.area === 'local' ? chrome.storage.local : chrome.storage.sync;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.storage.get(key);
      return (result[key] as T) ?? null;
    } catch (error) {
      logger.error(`Error getting ${key} from Chrome storage`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    try {
      await this.storage.set({ [key]: value });
      return true;
    } catch (error) {
      logger.error(`Error setting ${key} in Chrome storage`, error);
      return false;
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      await this.storage.remove(key);
      return true;
    } catch (error) {
      logger.error(`Error removing ${key} from Chrome storage`, error);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      await this.storage.clear();
      return true;
    } catch (error) {
      logger.error('Error clearing Chrome storage', error);
      return false;
    }
  }

  onChange(callback: (changes: StorageChanges) => void): void {
    // Create and store the event listener so we can remove it later
    const eventListener = (changes: chrome.storage.StorageChange, areaName: string) => {
      if (areaName === this.area) {
        callback(changes as StorageChanges);
      }
    };

    this.listenerMap.set(callback, eventListener);
    chrome.storage.onChanged.addListener(eventListener);
  }

  removeChangeListener(callback: (changes: StorageChanges) => void): void {
    const eventListener = this.listenerMap.get(callback);
    if (eventListener) {
      chrome.storage.onChanged.removeListener(eventListener);
      this.listenerMap.delete(callback);
    }
  }
}
