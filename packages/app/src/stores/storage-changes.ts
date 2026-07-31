import {
  describeThrown,
  getStorage,
  type KeyValueStore,
  logger,
  type StorageArea,
} from '@cuewise/shared';

/**
 * The configured store when this build can observe writes through it, else null. Never throws:
 * these callers are React effects and a store initializer, and an unconfigured registry is
 * reported by the reads that follow, not by a capability probe.
 *
 * Absent `onChanged` is not the only way to hear nothing. The port scopes the localStorage
 * backend to writes made THROUGH the store, so a consumer whose data is persisted by another
 * path — the zustand chrome adapter writes `localStorage` directly — is never notified there.
 */
export function observableStorage(): KeyValueStore | null {
  let store: KeyValueStore;
  try {
    store = getStorage();
  } catch {
    return null;
  }
  return store.onChanged === undefined ? null : store;
}

/** Subscribes, or answers null having reported why — a failure here silently stops convergence. */
export function safeSubscribe(
  store: KeyValueStore,
  handler: (keys: string[], area: StorageArea) => void
): (() => void) | null {
  try {
    return store.onChanged?.(handler) ?? null;
  } catch (error) {
    logger.error(`Could not observe storage changes: ${describeThrown(error)}`, error);
    return null;
  }
}
