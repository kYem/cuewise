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

export interface StorageObserver {
  /** Module-scoped and never torn down; call on every initialize(). */
  subscribeAndReconcile(): void;
}

/**
 * Keeps one store's in-memory copy converged on keys written anywhere else — a sync pull, or
 * another tab. `refresh` must only re-read and setState: going through the store's write path
 * would re-notify the sync engine about a change that came FROM it, and `refresh` must treat a
 * failed read as a failure rather than as an empty collection — see getListRaw.
 *
 * No area filter, unlike settings: `goals`, `customQuotes`, `collections` and `reminders` move
 * area with the `syncEnabled` setting, so pinning one would go deaf the moment they move.
 */
export function createStorageObserver(
  what: string,
  keys: readonly [string, ...string[]],
  refresh: () => Promise<void>
): StorageObserver {
  const watched = new Set<string>(keys);
  let observing: { store: ObservableKeyValueStore; unsubscribe: () => void } | null = null;
  let inFlight: Promise<void> | null = null;
  let pending = false;

  function run(): void {
    pending = false;
    // Through a resolved promise, so a synchronous throw lands here and not in the backend's
    // listener dispatch.
    inFlight = Promise.resolve()
      .then(refresh)
      .catch((error) => {
        logger.error(`Could not apply ${what} changed elsewhere: ${describeThrown(error)}`, error);
      })
      .finally(() => {
        inFlight = null;
        if (pending) {
          run();
        }
      });
  }

  // A pull writes one entity per call, so a burst coalesces into a single re-read — plus one
  // trailing pass, since a write landing mid-refresh is not in the snapshot that refresh read.
  function queueRefresh(): void {
    if (inFlight !== null) {
      pending = true;
      return;
    }
    run();
  }

  return {
    subscribeAndReconcile() {
      const store = observableStorage();
      if (observing !== null && observing.store !== store) {
        observing.unsubscribe();
        observing = null;
      }
      if (store !== null && observing === null) {
        const unsubscribe = safeSubscribe(store, what, (changed) => {
          if (changed.some((key) => watched.has(key))) {
            queueRefresh();
          }
        });
        // Left null on a failed subscribe, so the next initialize() retries rather than believing
        // it is already observing.
        if (unsubscribe !== null) {
          observing = { store, unsubscribe };
        }
      }
      // Unconditional, and this is what makes the load safe to leave unqueued: initialize's own
      // set may have just reinstalled the snapshot it read before a pull landed, and no further
      // event is coming to correct it.
      queueRefresh();
    },
  };
}

/**
 * Whether a re-read found nothing new. A change event names a write, not a changed value, so a
 * store's own write arrives here as a no-op, and swapping the array anyway re-renders every
 * consumer for nothing. Key order can differ between an in-memory object and one just parsed from
 * storage, so this may report a change that isn't one; for JSON-representable entities it cannot
 * miss one that is.
 */
export function sameEntities<T>(a: readonly T[], b: readonly NoInfer<T>[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
