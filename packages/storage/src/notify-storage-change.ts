import { logger, type StorageArea } from '@cuewise/shared';

export type StorageChangeHandler = (keys: string[], area: StorageArea) => void;

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
      const settled = subscriber(keys, area) as unknown;
      if (settled instanceof Promise) {
        settled.catch((error) => {
          logger.error('A storage change subscriber rejected', { keys, area, error });
        });
      }
    } catch (error) {
      logger.error('A storage change subscriber threw', { keys, area, error });
    }
  }
}
