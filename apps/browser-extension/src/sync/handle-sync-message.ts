import { logger } from '@cuewise/shared';
import type { SyncMutationAck, SyncMutationMessage } from './sync-messages';

/**
 * Structural subset of SyncEngine the router needs. Unlike SyncMutationSink,
 * markMutatedBulk is required — SyncEngine always implements it.
 */
export interface SyncMessageEngine {
  markMutated(collection: string, entityId: string): Promise<void> | void;
  markDeleted(collection: string, entityId: string): Promise<void> | void;
  markMutatedBulk(collection: string, entityIds: string[]): Promise<void> | void;
}

function hasMutationKind(msg: unknown): msg is Record<string, unknown> {
  if (typeof msg !== 'object' || msg === null) {
    return false;
  }
  return (msg as Record<string, unknown>).kind === 'cuewise-sync-mutation';
}

function isSyncMutationMessage(msg: unknown): msg is SyncMutationMessage {
  const candidate = msg as Record<string, unknown>;
  if (candidate.op !== 'mutated' && candidate.op !== 'deleted' && candidate.op !== 'mutatedBulk') {
    return false;
  }
  return typeof candidate.collection === 'string';
}

const MALFORMED: SyncMutationAck = { ok: false, reason: 'malformed' };

/** Routes a page-relayed mark to the SyncEngine and acks once the ledger write settles;
 * undefined for another channel's message (e.g. sync-control), so its own listener replies. */
export function handleSyncMessage(
  engine: SyncMessageEngine,
  msg: unknown
): Promise<SyncMutationAck> | undefined {
  if (!hasMutationKind(msg)) {
    return undefined;
  }
  if (!isSyncMutationMessage(msg)) {
    logger.warn('Ignoring malformed sync-mutation message', { received: typeof msg });
    return Promise.resolve(MALFORMED);
  }

  if (msg.op === 'mutatedBulk') {
    const { entityIds } = msg;
    if (entityIds === undefined) {
      logger.warn('Ignoring sync-mutation message: mutatedBulk missing entityIds', {
        collection: msg.collection,
      });
      return Promise.resolve(MALFORMED);
    }
    return settle(msg, () => engine.markMutatedBulk(msg.collection, entityIds));
  }

  const { entityId } = msg;
  if (entityId === undefined) {
    logger.warn('Ignoring sync-mutation message: missing entityId', {
      op: msg.op,
      collection: msg.collection,
    });
    return Promise.resolve(MALFORMED);
  }

  if (msg.op === 'mutated') {
    return settle(msg, () => engine.markMutated(msg.collection, entityId));
  }
  return settle(msg, () => engine.markDeleted(msg.collection, entityId));
}

function settle(
  msg: SyncMutationMessage,
  mark: () => Promise<void> | void
): Promise<SyncMutationAck> {
  return new Promise<void>((resolve) => {
    resolve(mark());
  })
    .then((): SyncMutationAck => ({ ok: true }))
    .catch((error: unknown): SyncMutationAck => {
      logger.error('Failed to record a relayed sync mutation', {
        op: msg.op,
        collection: msg.collection,
        error,
      });
      return { ok: false, reason: 'error' };
    });
}
