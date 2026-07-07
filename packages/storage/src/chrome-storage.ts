/**
 * Storage helpers — thin delegators over the platform KeyValueStore.
 *
 * The Chrome adapter self-registers as the default backend on load, so importing
 * @cuewise/storage needs no bootstrap and behaves as before. A Tauri app calls
 * `configurePlatform({ storage: new TauriKeyValueStore() })` after imports to
 * override it.
 */

import type { StorageArea, StorageResult } from '@cuewise/shared';
import { configurePlatform, getStorage } from '@cuewise/shared';
import { ChromeKeyValueStore } from './chrome-key-value-store';

// Re-export storage types for existing importers of './chrome-storage'.
export type { StorageArea, StorageError, StorageErrorType, StorageResult } from '@cuewise/shared';

configurePlatform({ storage: new ChromeKeyValueStore() });

export async function getFromStorage<T>(
  key: string,
  area: StorageArea = 'local'
): Promise<T | null> {
  return getStorage().get<T>(key, area);
}

export async function setInStorage<T>(
  key: string,
  value: T,
  area: StorageArea = 'local'
): Promise<StorageResult> {
  return getStorage().set(key, value, area);
}

export async function removeFromStorage(
  key: string,
  area: StorageArea = 'local'
): Promise<boolean> {
  return getStorage().remove(key, area);
}
