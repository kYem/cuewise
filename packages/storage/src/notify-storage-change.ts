import { logger, type StorageArea, type StorageChangeHandler } from '@cuewise/shared';

/** A failing subscriber must not fail the write that notified it, nor the subscribers after it. */
export function notifyStorageChange(
  subscribers: Iterable<StorageChangeHandler>,
  keys: string[],
  area: StorageArea
): void {
  for (const subscriber of subscribers) {
    try {
      // Typed `=> void`, but a caller can still hand back a promise, whose rejection a sync catch
      // cannot see.
      const settled: unknown = subscriber(keys, area);
      if (settled instanceof Promise) {
        settled.catch((error) => {
          logger.error('A storage change subscriber rejected', error, { keys, area });
        });
      }
    } catch (error) {
      logger.error('A storage change subscriber threw', error, { keys, area });
    }
  }
}
