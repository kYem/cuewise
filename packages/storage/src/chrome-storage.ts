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

/** Reads null for a value that no longer matches, so the caller's "nothing stored" path runs. */
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
    // The original, not `result.data`: zod strips fields a newer version wrote.
    return raw as T;
  }
  // Paths only — stored blobs hold the user's own quotes, goals and reminders.
  logger.error('Discarded an unreadable stored value', {
    key,
    area,
    paths: result.error.issues.map((issue) => issue.path.join('.')).slice(0, 5),
  });
  return null;
}

/**
 * Per item, not per list: the stores reload-then-rewrite the whole array, so emptying it on
 * one bad row would make the user's next edit persist that emptiness.
 */
export async function getValidatedListFromStorage<T>(
  key: string,
  itemSchema: ZodMiniType<T>,
  area: StorageArea = 'local'
): Promise<T[] | null> {
  const raw = await getStorage().get<unknown>(key, area);
  if (raw === null || raw === undefined) {
    return null;
  }
  if (!Array.isArray(raw)) {
    logger.error('Discarded a stored value that should have been a list', { key, area });
    return null;
  }
  const kept: T[] = [];
  const droppedAt: number[] = [];
  raw.forEach((item, index) => {
    if (itemSchema.safeParse(item).success) {
      // The original item, not the parsed copy — see the note above.
      kept.push(item as T);
    } else {
      droppedAt.push(index);
    }
  });
  if (droppedAt.length > 0) {
    // Positions and counts only; the items themselves are the user's own content. At error
    // level because the shipped default log level is 'error' — a warning reaches nobody.
    logger.error('Dropped unreadable items from a stored list', {
      key,
      area,
      dropped: droppedAt.length,
      of: raw.length,
      at: droppedAt.slice(0, 5),
    });
  }
  return kept;
}

/**
 * Carries through whatever on disk this caller could not have seen, judged by the schema that
 * hid it — otherwise the reload-then-rewrite cycle erases it on the next tab open.
 *
 * A caller that read RAW must write raw instead: it saw everything, so an omission is a
 * deliberate delete and has to land.
 */
export async function setValidatedListInStorage<T>(
  key: string,
  items: T[],
  itemSchema: ZodMiniType<T>,
  area: StorageArea = 'local'
): Promise<StorageResult> {
  // One instance for the read-modify-write, so a `configurePlatform` swap mid-flight cannot
  // merge one backend's rows into another's.
  const store = getStorage();
  const raw = await store.get<unknown>(key, area);
  if (!Array.isArray(raw)) {
    return store.set(key, items, area);
  }
  const quarantined = raw.filter((stored) => !itemSchema.safeParse(stored).success);
  if (quarantined.length === 0) {
    return store.set(key, items, area);
  }
  // By value and by id: both adapters mint fresh objects per read, so an identity check never
  // matches and the array doubles on every write; and re-creating a hidden item under its own
  // id would otherwise leave two entries for it, the broken one winning every id-keyed read.
  const written = new Set((items as unknown[]).map((item) => JSON.stringify(item)));
  const writtenIds = new Set<unknown>(
    (items as { id?: unknown }[]).map((item) => item?.id).filter((id) => typeof id === 'string')
  );
  const unreadable = quarantined.filter(
    (stored) =>
      !written.has(JSON.stringify(stored)) && !writtenIds.has((stored as { id?: unknown })?.id)
  );
  if (unreadable.length === 0) {
    return store.set(key, items, area);
  }
  logger.error('Preserved unreadable stored items through a write', {
    key,
    area,
    preserved: unreadable.length,
  });
  return store.set(key, [...items, ...unreadable], area);
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

export async function getManyFromStorage(
  keys: string[],
  area: StorageArea = 'local'
): Promise<Record<string, unknown>> {
  return getStorage().getMany(keys, area);
}

export async function setManyInStorage(
  entries: Record<string, unknown>,
  area: StorageArea = 'local'
): Promise<StorageResult> {
  return getStorage().setMany(entries, area);
}

export async function removeManyFromStorage(
  keys: string[],
  area: StorageArea = 'local'
): Promise<boolean> {
  return getStorage().removeMany(keys, area);
}
