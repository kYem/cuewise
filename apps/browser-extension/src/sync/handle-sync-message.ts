import { logger } from '@cuewise/shared';
import { isSyncMutationMark, type SyncMutationAck, type SyncMutationMark } from './sync-messages';

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
  for (const mark of coalesce(marks.filter(isRecordable))) {
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

function isRecordable(mark: unknown): mark is SyncMutationMark {
  if (isSyncMutationMark(mark)) {
    return true;
  }
  logger.warn('Ignoring malformed sync-mutation mark', { mark });
  return false;
}

function mutatedIds(mark: SyncMutationMark): string[] | undefined {
  if (mark.op === 'mutatedBulk') {
    return mark.entityIds;
  }
  if (mark.op === 'mutated') {
    return [mark.entityId];
  }
  return undefined;
}

// A run of edits to one collection becomes one bulk mark: one ledger write instead of one per edit.
function coalesce(marks: SyncMutationMark[]): SyncMutationMark[] {
  const merged: SyncMutationMark[] = [];
  for (const mark of marks) {
    const last = merged.at(-1);
    const ids = mutatedIds(mark);
    const lastIds = last === undefined ? undefined : mutatedIds(last);
    if (ids !== undefined && lastIds !== undefined && last?.collection === mark.collection) {
      merged[merged.length - 1] = {
        op: 'mutatedBulk',
        collection: mark.collection,
        entityIds: [...lastIds, ...ids],
      };
      continue;
    }
    merged.push(mark);
  }
  return merged;
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
