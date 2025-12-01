/**
 * localStorage adapter for web applications
 */

import { logger } from '@cuewise/shared';
import type { StorageAdapter, StorageChanges } from '../storage-interface';

export class LocalStorageAdapter implements StorageAdapter {
  private listenerMap = new WeakMap<
    (changes: StorageChanges) => void,
    (event: StorageEvent) => void
  >();

  async get<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      logger.error(`Error getting ${key} from localStorage`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Error setting ${key} in localStorage`, error);
      return false;
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      logger.error(`Error removing ${key} from localStorage`, error);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      logger.error('Error clearing localStorage', error);
      return false;
    }
  }

  onChange(callback: (changes: StorageChanges) => void): void {
    // Create and store the event listener so we can remove it later
    const eventListener = (event: StorageEvent) => {
      if (event.key) {
        callback({
          [event.key]: {
            oldValue: event.oldValue ? JSON.parse(event.oldValue) : null,
            newValue: event.newValue ? JSON.parse(event.newValue) : null,
          },
        });
      }
    };

    this.listenerMap.set(callback, eventListener);
    window.addEventListener('storage', eventListener);
  }

  removeChangeListener(callback: (changes: StorageChanges) => void): void {
    const eventListener = this.listenerMap.get(callback);
    if (eventListener) {
      window.removeEventListener('storage', eventListener);
      this.listenerMap.delete(callback);
    }
  }
}
