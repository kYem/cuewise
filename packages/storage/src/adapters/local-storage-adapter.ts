/**
 * localStorage adapter for web applications
 */

import type { StorageAdapter } from '../storage-interface';

export class LocalStorageAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error getting ${key} from localStorage:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting ${key} in localStorage:`, error);
      return false;
    }
  }

  async remove(key: string): Promise<boolean> {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing ${key} from localStorage:`, error);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  }

  onChange(callback: (changes: Record<string, any>) => void): void {
    // Listen to storage events from other tabs
    window.addEventListener('storage', (event) => {
      if (event.key) {
        callback({
          [event.key]: {
            oldValue: event.oldValue ? JSON.parse(event.oldValue) : null,
            newValue: event.newValue ? JSON.parse(event.newValue) : null,
          },
        });
      }
    });
  }

  removeChangeListener(callback: (changes: Record<string, any>) => void): void {
    window.removeEventListener('storage', callback as any);
  }
}
