import { logger, type SyncMutationSink } from '@cuewise/shared';
import type { SyncMutationMessage } from './sync-messages';

/**
 * Page-realm sync sink (ENG-45 option B). The page has no SyncEngine of its own —
 * it just relays each mutation to the background (the single sync owner) over
 * chrome.runtime messaging and returns; it touches no storage and builds no engine.
 */
export class ChromeRuntimeSyncSink implements SyncMutationSink {
  markMutated(collection: string, entityId: string): void {
    this.send({ kind: 'cuewise-sync-mutation', op: 'mutated', collection, entityId });
  }

  markDeleted(collection: string, entityId: string): void {
    this.send({ kind: 'cuewise-sync-mutation', op: 'deleted', collection, entityId });
  }

  markMutatedBulk(collection: string, entityIds: string[]): void {
    this.send({ kind: 'cuewise-sync-mutation', op: 'mutatedBulk', collection, entityIds });
  }

  // Fire-and-forget: sendMessage can reject (no receiver / service worker asleep) — a
  // sync-notify must never break the store mutation that triggered it, so every error
  // path is swallowed and logged, mirroring notifyMutated's swallow semantics.
  private send(message: SyncMutationMessage): void {
    try {
      Promise.resolve(chrome.runtime.sendMessage(message)).catch((error) => {
        logger.warn('Sync mutation relay failed', {
          op: message.op,
          collection: message.collection,
          error,
        });
      });
    } catch (error) {
      logger.warn('Sync mutation relay failed', {
        op: message.op,
        collection: message.collection,
        error,
      });
    }
  }
}
