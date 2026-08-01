import {
  canObserveWrites,
  describeThrown,
  getStorage,
  logger,
  type ObservableKeyValueStore,
  type StorageChangeHandler,
} from '@cuewise/shared';

/**
 * The configured store when this build can observe writes through it, else null. Returns null
 * rather than throwing — a caller is a React effect, where a throw takes down the render tree.
 * A missing `onChanged` is a platform limit and stays quiet; an unreachable registry is logged.
 */
export function observableStorage(): ObservableKeyValueStore | null {
  let store: ObservableKeyValueStore | null = null;
  try {
    const configured = getStorage();
    if (canObserveWrites(configured)) {
      store = configured;
    }
  } catch (error) {
    logger.error(`No storage backend to observe: ${describeThrown(error)}`, error);
  }
  return store;
}

/**
 * Named, since a failure here silently stops one consumer converging and nothing else says which. The
 * teardown it hands back cannot throw: callers pass it straight to React, where a throwing cleanup
 * takes down the tree and skips the cleanups queued behind it.
 */
export function safeSubscribe(
  store: ObservableKeyValueStore,
  what: string,
  handler: StorageChangeHandler
): (() => void) | null {
  let unsubscribe: () => void;
  try {
    unsubscribe = store.onChanged(handler);
  } catch (error) {
    logger.error(`Could not observe storage changes for ${what}: ${describeThrown(error)}`, error);
    return null;
  }
  return () => {
    try {
      unsubscribe();
    } catch (error) {
      logger.error(
        `Could not stop observing storage changes for ${what}: ${describeThrown(error)}`,
        error
      );
    }
  };
}
