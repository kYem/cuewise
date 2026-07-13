import { logger } from '../logger';
import { getSyncSink } from './registry';

// Fire-and-forget: a sync-notify failure (sync or async) must never break the store mutation
// that triggered it, so every error path is swallowed and logged, never thrown/rejected.
export function notifyMutated(collection: string, entityId: string): void {
  const sink = getSyncSink();
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

// Bulk form of notifyMutated: one round trip for a whole batch of ids instead of one per id.
export function notifyMutatedBulk(collection: string, entityIds: string[]): void {
  const sink = getSyncSink();
  if (sink === null || sink.markMutatedBulk === undefined || entityIds.length === 0) {
    return;
  }
  try {
    Promise.resolve(sink.markMutatedBulk(collection, entityIds)).catch((error) => {
      logger.warn('Sync notify (markMutatedBulk) failed', { collection, entityIds, error });
    });
  } catch (error) {
    logger.warn('Sync notify (markMutatedBulk) failed', { collection, entityIds, error });
  }
}

export function notifyDeleted(collection: string, entityId: string): void {
  const sink = getSyncSink();
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
