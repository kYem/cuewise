import { logger } from '@cuewise/shared';
import type { SyncMutationMessage } from './sync-messages';

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

/**
 * Routes a page-relayed sync-mutation message (ENG-45 option B) to the background's
 * SyncEngine. A message on a different channel (e.g. sync-control) is silently ignored;
 * only a message that claims the mutation kind but has a bad op/collection shape warns.
 */
export function handleSyncMessage(engine: SyncMessageEngine, msg: unknown): void {
  if (!hasMutationKind(msg)) {
    return;
  }
  if (!isSyncMutationMessage(msg)) {
    logger.warn('Ignoring malformed sync-mutation message', { received: typeof msg });
    return;
  }

  if (msg.op === 'mutatedBulk') {
    if (msg.entityIds === undefined) {
      logger.warn('Ignoring sync-mutation message: mutatedBulk missing entityIds', {
        collection: msg.collection,
      });
      return;
    }
    void engine.markMutatedBulk(msg.collection, msg.entityIds);
    return;
  }

  if (msg.entityId === undefined) {
    logger.warn('Ignoring sync-mutation message: missing entityId', {
      op: msg.op,
      collection: msg.collection,
    });
    return;
  }

  if (msg.op === 'mutated') {
    void engine.markMutated(msg.collection, msg.entityId);
  } else {
    void engine.markDeleted(msg.collection, msg.entityId);
  }
}
