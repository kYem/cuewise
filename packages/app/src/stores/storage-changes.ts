import {
  describeThrown,
  getStorage,
  type KeyValueStore,
  logger,
  type StorageArea,
} from '@cuewise/shared';

/**
 * The configured store when this build can observe writes through it, else null. Returns null
 * rather than throwing — a caller is a React effect, where a throw takes down the render tree.
 * A missing `onChanged` is a platform limit and stays quiet; an unreachable registry is logged.
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

/** Names the consumer in the log: a failure here stops it converging and never retries. */
export function safeSubscribe(
  store: KeyValueStore,
  what: string,
  handler: (keys: string[], area: StorageArea) => void
): (() => void) | null {
  let unsubscribe: (() => void) | undefined;
  try {
    unsubscribe = store.onChanged?.(handler);
  } catch (error) {
    logger.error(`Could not observe storage changes for ${what}: ${describeThrown(error)}`, error);
    return null;
  }
  if (unsubscribe === undefined) {
    logger.error(`Storage cannot observe changes for ${what}, so it will not converge`);
    return null;
  }
  return unsubscribe;
}
