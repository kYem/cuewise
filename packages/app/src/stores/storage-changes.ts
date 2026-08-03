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
  /** Idempotent, and retries a subscribe that failed; call before the load's first read. */
  subscribe(): void;
  /** Subscribes, then re-reads and settles. Await it, or the caller gets pre-reconcile state. */
  reconcile(): Promise<void>;
}

/** How a store says its view went stale, and takes it back. See createStaleLatch. */
export interface StaleReport {
  stale(): void;
  fresh(): void;
}

/**
 * Keeps one store's in-memory copy converged on keys written anywhere else — a sync pull, or
 * another tab. `refresh` must only re-read and setState: going through the store's write path
 * would re-notify the sync engine about a change that came FROM it. It must also let a failed
 * read reject rather than answering an empty collection, which every whole-array writer would
 * then persist as a deletion.
 *
 * No area filter, unlike settings: `goals`, `customQuotes`, `collections` and `reminders` move
 * area with the `syncEnabled` setting, so pinning one would go deaf the moment they move.
 */
export function createStorageObserver(
  what: string,
  keys: readonly [string, ...string[]],
  refresh: () => Promise<void>,
  report?: StaleReport
): StorageObserver {
  const watched = new Set<string>(keys);
  let observing: { store: ObservableKeyValueStore; unsubscribe: () => void } | null = null;
  let inFlight: Promise<void> | null = null;
  let pending = false;
  let drained: { promise: Promise<void>; settle: () => void } | null = null;

  function run(): void {
    pending = false;
    // Through a resolved promise, so a synchronous throw lands here and not in the backend's
    // listener dispatch.
    inFlight = Promise.resolve()
      .then(refresh)
      .then(
        () => report?.fresh(),
        (error) => {
          logger.error(
            `Could not apply ${what} changed elsewhere: ${describeThrown(error)}`,
            error
          );
          // The copy this store keeps is now older than storage, and its next write rewrites the
          // whole array from it — so this is named to the user, not only to the log.
          report?.stale();
        }
      )
      .finally(() => {
        inFlight = null;
        if (pending) {
          run();
          return;
        }
        const settled = drained;
        drained = null;
        settled?.settle();
      });
  }

  /**
   * A pull writes one entity per call, so a burst coalesces into a single re-read — plus one
   * trailing pass, since a write landing mid-refresh is not in the snapshot that refresh read.
   *
   * Answers when the queue is empty, NOT when the current pass ends: awaiting the pass already
   * running would hand the caller a read taken before it asked for one.
   */
  function queueRefresh(): Promise<void> {
    if (drained === null) {
      let settle = (): void => {};
      const promise = new Promise<void>((resolve) => {
        settle = resolve;
      });
      drained = { promise, settle };
    }
    // The episode this call joined; run() replaces `drained` once that episode settles.
    const awaiting = drained.promise;
    if (inFlight === null) {
      run();
    } else {
      pending = true;
    }
    return awaiting;
  }

  function subscribe(): void {
    const store = observableStorage();
    if (observing !== null && observing.store !== store) {
      observing.unsubscribe();
      observing = null;
    }
    if (store === null || observing !== null) {
      return;
    }
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

  return {
    subscribe,
    reconcile() {
      subscribe();
      return queueRefresh();
    },
  };
}

/**
 * Says once that a store's view is older than storage, and re-arms only after a refresh that
 * fixed it. Deliberately not the store's `error` field: these stores render that as a whole-panel
 * failure, and a view that is merely stale is still worth showing.
 */
export function createStaleLatch(warn: (message: string) => void, message: string): StaleReport {
  let latched = false;
  return {
    stale() {
      if (latched) {
        return;
      }
      latched = true;
      warn(message);
    },
    fresh() {
      latched = false;
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
