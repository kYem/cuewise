/**
 * AsyncStorage adapter for React Native applications
 * Note: This is a placeholder stub. For React Native apps, you'll need to:
 * 1. Install @react-native-async-storage/async-storage
 * 2. Import and use AsyncStorage directly in your React Native app
 * 3. Pass it to this adapter or create a concrete implementation
 */

import type { StorageAdapter } from '../storage-interface';

/**
 * Minimal interface for AsyncStorage from @react-native-async-storage/async-storage
 */
interface AsyncStorageInterface {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}

export class AsyncStorageAdapter implements StorageAdapter {
  private AsyncStorage: AsyncStorageInterface | null = null;

  constructor(asyncStorageInstance?: AsyncStorageInterface) {
    // Accept AsyncStorage instance from React Native app
    this.AsyncStorage = asyncStorageInstance ?? null;

    if (!this.AsyncStorage) {
      console.warn(
        'AsyncStorage not provided. This adapter will not work. Pass AsyncStorage instance to constructor.'
      );
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.AsyncStorage) return null;

    try {
      const item = await this.AsyncStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error getting ${key} from AsyncStorage:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    if (!this.AsyncStorage) return false;

    try {
      await this.AsyncStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error setting ${key} in AsyncStorage:`, error);
      return false;
    }
  }

  async remove(key: string): Promise<boolean> {
    if (!this.AsyncStorage) return false;

    try {
      await this.AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing ${key} from AsyncStorage:`, error);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    if (!this.AsyncStorage) return false;

    try {
      await this.AsyncStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing AsyncStorage:', error);
      return false;
    }
  }

  // Note: AsyncStorage doesn't have built-in change listeners
  // You would need to implement this using a pub/sub pattern if needed
}
