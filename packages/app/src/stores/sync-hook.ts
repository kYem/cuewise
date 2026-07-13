import { logger } from '@cuewise/shared';

/**
 * Minimal contract the app satisfies with a real SyncEngine at startup. Stores depend only on
 * this — never on `@cuewise/sync-engine` directly — to avoid a dependency cycle.
 */
export interface SyncMutationSink {
  markMutated(collection: string, entityId: string): Promise<void> | void;
  markDeleted(collection: string, entityId: string): Promise<void> | void;
}

let sink: SyncMutationSink | null = null;

export function setSyncEngine(engine: SyncMutationSink | null): void {
  sink = engine;
}

// Fire-and-forget: a sync-notify failure (sync or async) must never break the store mutation
// that triggered it, so every error path is swallowed and logged, never thrown/rejected.
export function notifyMutated(collection: string, entityId: string): void {
  if (sink === null) {
    return;
  }
  try {
    Promise.resolve(sink.markMutated(collection, entityId)).catch((error) => {
      logger.warn('Sync notify (markMutated) failed', { collection, entityId, error });
    });
  } catch (error) {
    logger.warn('Sync notify (markMutated) failed', { collection, entityId, error });
  }
}

export function notifyDeleted(collection: string, entityId: string): void {
  if (sink === null) {
    return;
  }
  try {
    Promise.resolve(sink.markDeleted(collection, entityId)).catch((error) => {
      logger.warn('Sync notify (markDeleted) failed', { collection, entityId, error });
    });
  } catch (error) {
    logger.warn('Sync notify (markDeleted) failed', { collection, entityId, error });
  }
}
