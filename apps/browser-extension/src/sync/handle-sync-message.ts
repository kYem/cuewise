import { logger } from '@cuewise/shared';
import type { SyncMutationAck, SyncMutationMark } from './sync-messages';

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

function isSyncMutationMark(mark: unknown): mark is SyncMutationMark {
  if (typeof mark !== 'object' || mark === null) {
    return false;
  }
  const candidate = mark as Record<string, unknown>;
  if (typeof candidate.collection !== 'string') {
    return false;
  }
  if (candidate.op === 'mutatedBulk') {
    return Array.isArray(candidate.entityIds);
  }
  if (candidate.op === 'mutated' || candidate.op === 'deleted') {
    return typeof candidate.entityId === 'string';
  }
  return false;
}

/** Routes a page-relayed batch of marks to the SyncEngine and acks once the ledger writes settle;
 * undefined for another channel's message (e.g. sync-control), so its own listener replies. */
export function handleSyncMessage(
  engine: SyncMessageEngine,
  msg: unknown
): Promise<SyncMutationAck> | undefined {
  if (!hasMutationKind(msg)) {
    return undefined;
  }
  return recordMarks(engine, msg.marks);
}

// In order, stopping at the first failure: the page resends the whole batch, and re-marking
// the ones that landed only restamps them.
async function recordMarks(engine: SyncMessageEngine, marks: unknown): Promise<SyncMutationAck> {
  if (!Array.isArray(marks)) {
    logger.warn('Ignoring sync-mutation message without marks', { received: typeof marks });
    return { ok: false, reason: 'malformed' };
  }
  for (const mark of marks) {
    if (!isSyncMutationMark(mark)) {
      logger.warn('Ignoring malformed sync-mutation mark', { mark });
      continue;
    }
    try {
      await recordMark(engine, mark);
    } catch (error) {
      logger.error('Failed to record a relayed sync mutation', {
        op: mark.op,
        collection: mark.collection,
        error,
      });
      return { ok: false, reason: 'error' };
    }
  }
  return { ok: true };
}

function recordMark(engine: SyncMessageEngine, mark: SyncMutationMark): Promise<void> | void {
  if (mark.op === 'mutatedBulk') {
    return engine.markMutatedBulk(mark.collection, mark.entityIds);
  }
  if (mark.op === 'mutated') {
    return engine.markMutated(mark.collection, mark.entityId);
  }
  return engine.markDeleted(mark.collection, mark.entityId);
}
