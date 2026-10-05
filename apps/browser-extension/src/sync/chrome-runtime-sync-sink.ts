import { logger, type SyncMutationSink } from '@cuewise/shared';
import type { SyncMutationAck, SyncMutationMark, SyncMutationMessage } from './sync-messages';

/** Waits before each retry of an unacknowledged batch; the batch is dropped after the last. */
export const RELAY_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

function isSyncMutationAck(reply: unknown): reply is SyncMutationAck {
  return typeof reply === 'object' && reply !== null && 'ok' in reply;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Page-realm sync sink (ENG-45 option B): relays marks to the worker, the single sync owner,
 * and retries until the worker acks the ledger writes. */
export class ChromeRuntimeSyncSink implements SyncMutationSink {
  private pending: SyncMutationMark[] = [];
  private draining = false;

  markMutated(collection: string, entityId: string): void {
    this.enqueue({ op: 'mutated', collection, entityId });
  }

  markDeleted(collection: string, entityId: string): void {
    this.enqueue({ op: 'deleted', collection, entityId });
  }

  markMutatedBulk(collection: string, entityIds: string[]): void {
    this.enqueue({ op: 'mutatedBulk', collection, entityIds });
  }

  private enqueue(mark: SyncMutationMark): void {
    this.pending.push(mark);
    if (!this.draining) {
      void this.drain();
    }
  }

  // One batch in flight at a time: a retried edit landing after a later delete would resurrect it.
  private async drain(): Promise<void> {
    this.draining = true;
    while (this.pending.length > 0) {
      const marks = this.pending;
      this.pending = [];
      await this.deliver(marks);
    }
    this.draining = false;
  }

  private async deliver(marks: SyncMutationMark[]): Promise<void> {
    for (let attempt = 0; attempt <= RELAY_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await wait(RELAY_RETRY_DELAYS_MS[attempt - 1]);
      }
      if (await this.send(marks)) {
        return;
      }
    }
    // Error, not warn: the shipped log level is 'error', and these dirty marks are lost for good.
    logger.error('Sync mutation relay gave up', { marks: marks.length });
  }

  /** True once nothing is left to retry: the worker recorded the marks or refused the message. */
  private async send(marks: SyncMutationMark[]): Promise<boolean> {
    let reply: unknown;
    try {
      reply = await chrome.runtime.sendMessage({
        kind: 'cuewise-sync-mutation',
        marks,
      } satisfies SyncMutationMessage);
    } catch (error) {
      // No receiver yet (the worker is still starting) — the same as no ack.
      reply = error;
    }
    if (isSyncMutationAck(reply) && (reply.ok || reply.reason === 'malformed')) {
      return true;
    }
    logger.warn('Sync mutation relay not acknowledged', { marks: marks.length, reply });
    return false;
  }
}
