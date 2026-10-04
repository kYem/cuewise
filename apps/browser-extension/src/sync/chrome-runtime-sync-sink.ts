import { logger, type SyncMutationSink } from '@cuewise/shared';
import type { SyncMutationAck, SyncMutationMessage } from './sync-messages';

/** Waits before each retry of an unacknowledged mark; the mark is dropped after the last. */
export const RELAY_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

function isSyncMutationAck(reply: unknown): reply is SyncMutationAck {
  return typeof reply === 'object' && reply !== null && 'ok' in reply;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Page-realm sync sink (ENG-45 option B): relays each mark to the worker, the single sync
 * owner, and retries until the worker acks the ledger write. */
export class ChromeRuntimeSyncSink implements SyncMutationSink {
  private readonly queue: SyncMutationMessage[] = [];
  private draining = false;

  markMutated(collection: string, entityId: string): void {
    this.enqueue({ kind: 'cuewise-sync-mutation', op: 'mutated', collection, entityId });
  }

  markDeleted(collection: string, entityId: string): void {
    this.enqueue({ kind: 'cuewise-sync-mutation', op: 'deleted', collection, entityId });
  }

  markMutatedBulk(collection: string, entityIds: string[]): void {
    this.enqueue({ kind: 'cuewise-sync-mutation', op: 'mutatedBulk', collection, entityIds });
  }

  private enqueue(message: SyncMutationMessage): void {
    this.queue.push(message);
    if (!this.draining) {
      void this.drain();
    }
  }

  // One mark in flight at a time: a retried edit landing after a later delete would resurrect it.
  private async drain(): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      await this.deliver(this.queue[0]);
      this.queue.shift();
    }
    this.draining = false;
  }

  private async deliver(message: SyncMutationMessage): Promise<void> {
    for (const delayMs of RELAY_RETRY_DELAYS_MS) {
      if (await this.send(message)) {
        return;
      }
      await wait(delayMs);
    }
    if (await this.send(message)) {
      return;
    }
    // Error, not warn: the shipped log level is 'error', and this is a dirty mark lost for good.
    logger.error('Sync mutation relay gave up', {
      op: message.op,
      collection: message.collection,
    });
  }

  /** True once nothing is left to retry: the worker recorded the mark or refused its shape. */
  private async send(message: SyncMutationMessage): Promise<boolean> {
    try {
      const reply: unknown = await chrome.runtime.sendMessage(message);
      if (isSyncMutationAck(reply) && (reply.ok || reply.reason === 'malformed')) {
        return true;
      }
      logger.warn('Sync mutation relay not acknowledged', {
        op: message.op,
        collection: message.collection,
        reply,
      });
    } catch (error) {
      // No receiver yet (the worker is still starting) — the same as no ack.
      logger.warn('Sync mutation relay failed', {
        op: message.op,
        collection: message.collection,
        error,
      });
    }
    return false;
  }
}
