import {
  describeThrown,
  getStorage,
  type KeyValueStore,
  logger,
  type StorageArea,
} from '@cuewise/shared';

/**
 * The configured store when this build can observe writes through it, else null. Never throws:
 * these callers are React effects and a store initializer, where a throw crashes the render tree.
 *
 * The two nulls are not the same. An absent `onChanged` is a platform limit the caller lives with;
 * an unreachable registry is a wiring bug, and the hooks that ask do no follow-up read that would
 * report it.
 */
export function observableStorage(): KeyValueStore | null {
  let store: KeyValueStore;
  try {
    store = getStorage();
  } catch (error) {
    logger.error(`No storage backend to observe: ${describeThrown(error)}`, error);
    return null;
  }
  return store.onChanged === undefined ? null : store;
}

/** Named, since a failure here silently stops one consumer converging and never retries. */
export function safeSubscribe(
  store: KeyValueStore,
  what: string,
  handler: (keys: string[], area: StorageArea) => void
): (() => void) | null {
  try {
    return store.onChanged?.(handler) ?? null;
  } catch (error) {
    logger.error(`Could not observe storage changes for ${what}: ${describeThrown(error)}`, error);
    return null;
  }
}
