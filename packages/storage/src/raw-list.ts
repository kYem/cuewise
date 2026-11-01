import { logger } from '@cuewise/shared';
import { getManyFromStorage, type StorageArea } from './chrome-storage';

/**
 * Raw list reads for the sync engine. An item hidden from `readAll` is deleted by the next
 * `writeOne`, and its absence is how the cycle infers a tombstone for every other device.
 *
 * So only a key that was never written reads as `[]`. A failed read always throws; an unusable value
 * throws unless the caller opts into `resetUnreadable`: a wedged collection is recoverable, a
 * fleet-wide erase is not.
 * The batch read is what separates the two — `get` answers `null` for either.
 */
export async function getListRaw<T>(
  key: string,
  area: StorageArea,
  // Unreadable reads as [] instead of throwing — only for a local write that would otherwise be
  // blocked for good, never a sync reader (see above).
  { resetUnreadable = false } = {}
): Promise<T[]> {
  const stored = await getManyFromStorage([key], area);
  if (stored === null) {
    throw new Error(`Could not read the stored ${key} list`);
  }
  const entry = stored[key];
  if (entry === undefined) {
    return [];
  }
  if (!entry.readable || !Array.isArray(entry.value)) {
    if (resetUnreadable) {
      // The shape, never the content: it tells corruption from a newer build's format afterwards.
      const kind = !entry.readable
        ? 'unparseable'
        : entry.value === null
          ? 'null'
          : typeof entry.value;
      logger.error('Starting afresh over a stored list this build cannot use', { key, area, kind });
      return [];
    }
    logger.error('Refusing to read a stored list this build cannot use', { key, area });
    throw new Error(`The stored ${key} list is unreadable`);
  }
  // Shape, not content: a null or primitive row carries no id, so nothing can key it and every
  // caller that spreads the list and reads `.id` throws on it. Rows that survive are untouched.
  const rows = entry.value as unknown[];
  const usable = rows.filter((row) => row !== null && typeof row === 'object');
  if (usable.length !== rows.length) {
    logger.error('Dropped rows with no usable shape from a raw list read', {
      key,
      area,
      dropped: rows.length - usable.length,
      of: rows.length,
    });
  }
  return usable as T[];
}
