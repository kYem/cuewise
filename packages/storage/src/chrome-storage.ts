/**
 * Storage helpers — thin delegators over the platform KeyValueStore.
 *
 * A capability-detected backend self-registers on load (chrome.storage in the
 * extension, localStorage under the vite dev server), so importing
 * @cuewise/storage needs no bootstrap. A Tauri app calls
 * `configurePlatform({ storage: new TauriKeyValueStore() })` after imports to
 * override it.
 */

import type { KeyValueStore, StorageArea, StorageResult } from '@cuewise/shared';
import { configurePlatform, getStorage, logger } from '@cuewise/shared';
import type { ZodMiniType } from 'zod/mini';
import { ChromeKeyValueStore } from './chrome-key-value-store';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';

// Re-export storage types for existing importers of './chrome-storage'.
export type { StorageArea, StorageError, StorageErrorType, StorageResult } from '@cuewise/shared';

const defaultStore: KeyValueStore =
  typeof chrome !== 'undefined' && chrome.storage
    ? new ChromeKeyValueStore()
    : new LocalStorageKeyValueStore();
configurePlatform({ storage: defaultStore });

export async function getFromStorage<T>(
  key: string,
  area: StorageArea = 'local'
): Promise<T | null> {
  return getStorage().get<T>(key, area);
}

/**
 * A read that checks what it found. Anything that no longer matches the schema is dropped
 * and logged rather than returned, because the alternative is handing a shape the UI
 * cannot render straight to React — which is not one bad render but a broken page on every
 * open, since the same blob is read back every time (ENG-18 lost a whole new tab that way).
 *
 * The caller's own "nothing stored" path then takes over: seeds, defaults, or a refetch.
 */
export async function getValidatedFromStorage<T>(
  key: string,
  schema: ZodMiniType<T>,
  area: StorageArea = 'local'
): Promise<T | null> {
  const raw = await getStorage().get<unknown>(key, area);
  if (raw === null || raw === undefined) {
    return null;
  }
  const result = schema.safeParse(raw);
  if (result.success) {
    // The original, not `result.data`: zod strips keys the schema doesn't name, so
    // returning the parsed copy would silently delete any field a *newer* version wrote —
    // and the next write would persist that deletion. A downgrade, or two synced devices
    // on different versions, would quietly lose data. This validates; it does not edit.
    return raw as T;
  }
  // The value itself is never logged: stored blobs hold the user's own quotes, goals and
  // reminders. Where it failed is enough to diagnose a shape change.
  logger.warn('Discarded an unreadable stored value', {
    key,
    area,
    paths: result.error.issues.map((issue) => issue.path.join('.')).slice(0, 5),
  });
  return null;
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
