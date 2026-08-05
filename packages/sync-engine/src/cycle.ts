import { type DataKey, DecryptError, EnvelopeParseError } from '@cuewise/crypto';
import {
  hlcDecode,
  hlcEncode,
  hlcReceive,
  logger,
  type PushRecord,
  type SyncRecord,
} from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import { type CollectionBinding, DEVICE_LOCAL_SETTINGS_KEYS } from './collections';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';
import { fromSyncRecord, toPushRecord } from './record-map';
import type { ConflictStrategy, RecordBody } from './strategy';

// Structural subset of ApiClient — the cycle only needs these two calls.
export interface SyncTransport {
  pushChanges(records: PushRecord[]): Promise<{ cursor: number }>;
  getChanges(since: number): Promise<{ records: SyncRecord[]; cursor: number }>;
}

export interface CycleDeps {
  transport: SyncTransport;
  meta: SyncMetadataStore;
  bindings: CollectionBinding[];
  dk: DataKey;
  keyId: string;
  strategy: ConflictStrategy;
  now?: () => number;
  onQuarantine?: (key: string) => void;
  /**
   * True once the account this cycle belongs to is gone; the cycle then stops without writing or
   * saving anything further. Required, so no caller can silently opt back into an uncancellable one.
   */
  isCancelled: () => boolean;
}

async function saveUnlessCancelled(deps: CycleDeps, meta: SyncMeta): Promise<boolean> {
  if (deps.isCancelled()) {
    return false;
  }
  await deps.meta.save(meta);
  return true;
}

/**
 * Records that the cycle stopped for a removed account. Records already applied stay on this device
 * with no hlc left to explain them, so this count is the only trace of where they came from.
 */
function cancelledPull(applied: number): PullResult {
  if (applied > 0) {
    // "applied", not "remain": a pulled tombstone counts too, and that one deleted local data.
    logger.error(
      `Cloud sync stopped a pull for a disconnected account; ${applied} of its records had already been applied to this device`
    );
  }
  return { kind: 'cancelled' };
}

const MAX_PUSH_BATCH = 100;
// Must match the server's MAX_CHANGES_PAGE_SIZE (apps/api/src/d1-store.ts) — a page this size
// signals "more to fetch", so pullOnce loops again.
export const PULL_PAGE = 500;

interface DirtyRecord {
  collection: string;
  entityId: string;
  record: PushRecord;
}

/**
 * Counts per collection for the cycle summary. Names and totals only — never entity ids or
 * bodies, which is the whole point of the server holding ciphertext.
 */
function tallyByCollection(collections: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of collections) {
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/** Batches before a `cancelled` still reached the server. */
export type PushResult = { kind: 'complete' } | { kind: 'cancelled' };

/** Seals every dirty entity and pushes it in batches, clearing dirty/tombstones as each batch acks. */
export async function pushOnce(deps: CycleDeps): Promise<PushResult> {
  const meta = await deps.meta.load();
  const dirtyRecords = await buildDirtyRecords(deps, meta);
  if (dirtyRecords.length === 0) {
    return { kind: 'complete' };
  }

  for (let start = 0; start < dirtyRecords.length; start += MAX_PUSH_BATCH) {
    if (deps.isCancelled()) {
      return { kind: 'cancelled' };
    }
    const batch = dirtyRecords.slice(start, start + MAX_PUSH_BATCH);
    await deps.transport.pushChanges(batch.map((item) => item.record));
    clearAcked(meta, batch);
    // After the round trip, not just before: `save` rewrites the whole ledger from a pre-disable
    // snapshot, restoring the cursor and hlcs disableSync cleared. The lost ack costs one re-push.
    if (deps.isCancelled()) {
      logger.error(
        `Cloud sync stopped a push for a disconnected account, but its server had already accepted ${batch.length} records`
      );
      return { kind: 'cancelled' };
    }
    await deps.meta.save(meta);
  }
  logger.debug(`Sync push sent ${dirtyRecords.length} record(s)`, {
    byCollection: tallyByCollection(dirtyRecords.map((item) => item.collection)),
  });
  return { kind: 'complete' };
}

async function buildDirtyRecords(deps: CycleDeps, meta: SyncMeta): Promise<DirtyRecord[]> {
  const dirtyRecords: DirtyRecord[] = [];

  for (const collection of Object.keys(meta.dirty)) {
    const binding = deps.bindings.find((b) => b.name === collection);
    if (binding === undefined) {
      logger.warn('Skipping dirty entities for unknown collection', { collection });
      continue;
    }

    const all = await binding.readAll();
    for (const entityId of meta.dirty[collection]) {
      // Mirrors settingsBinding.writeOne's guard: a device-local key that snuck into dirty must
      // never push — readAll() already excludes it, so pushing would seal a spurious tombstone.
      if (collection === 'settings' && DEVICE_LOCAL_SETTINGS_KEYS.includes(entityId)) {
        continue;
      }
      const key = SyncMetadataStore.entityKey(collection, entityId);
      const hlc = meta.hlcs[key];
      if (hlc === undefined) {
        continue;
      }

      const entity = all[entityId] ?? null;
      const body: RecordBody = { entity, hlc };
      const record = await toPushRecord(deps.dk, deps.keyId, collection, entityId, body);
      dirtyRecords.push({ collection, entityId, record });
    }
  }

  return dirtyRecords;
}

// Ack clears the pushed ids from dirty (pruning empty collections) and resolves their tombstones.
function clearAcked(meta: SyncMeta, batch: DirtyRecord[]): void {
  for (const { collection, entityId } of batch) {
    const ids = meta.dirty[collection];
    if (ids === undefined) {
      continue;
    }
    const remaining = ids.filter((id) => id !== entityId);
    if (remaining.length === 0) {
      delete meta.dirty[collection];
    } else {
      meta.dirty[collection] = remaining;
    }

    const key = SyncMetadataStore.entityKey(collection, entityId);
    meta.tombstones = meta.tombstones.filter((t) => t !== key);
  }
}

/**
 * What one pull did. `stalled` is not a completed pull: the cursor is parked before a record
 * whose local write failed, so no later remote change can reach this device until it succeeds.
 */
export type PullResult =
  | { kind: 'complete' }
  | { kind: 'resynced' }
  | { kind: 'cancelled' }
  | { kind: 'stalled'; collection: string; entityId: string };

/** Pulls remote changes in seq order, resolves each via the strategy, and applies the winners. */
export async function pullOnce(deps: CycleDeps): Promise<PullResult> {
  const meta = await deps.meta.load();
  // Once per collection per pull — a page of unknown records is one line, not N.
  const warnedUnknownCollections = new Set<string>();
  let appliedCount = 0;
  const startCursor = meta.cursor;
  const appliedCollections: string[] = [];

  let pageSize = PULL_PAGE;
  while (pageSize === PULL_PAGE) {
    if (deps.isCancelled()) {
      return cancelledPull(appliedCount);
    }
    let result: { records: SyncRecord[]; cursor: number };
    try {
      result = await deps.transport.getChanges(meta.cursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'resync_required') {
        meta.cursor = 0;
        if (!(await saveUnlessCancelled(deps, meta))) {
          return cancelledPull(appliedCount);
        }
        return { kind: 'resynced' };
      }
      throw err;
    }
    pageSize = result.records.length;

    for (const rec of result.records) {
      if (deps.isCancelled()) {
        return cancelledPull(appliedCount);
      }
      const applied = await applyPulledRecord(deps, meta, rec, warnedUnknownCollections);
      if (applied === 'failed') {
        // Apply-before-advance: the write failed, so stop here and leave the cursor before it.
        if (!(await saveUnlessCancelled(deps, meta))) {
          return cancelledPull(appliedCount);
        }
        return { kind: 'stalled', collection: rec.collection, entityId: rec.entityId };
      }
      if (applied === 'wrote') {
        appliedCount += 1;
        appliedCollections.push(rec.collection);
      }
    }
  }

  if (!(await saveUnlessCancelled(deps, meta))) {
    return cancelledPull(appliedCount);
  }
  logger.debug(`Sync pull applied ${appliedCount} record(s)`, {
    byCollection: tallyByCollection(appliedCollections),
    cursor: `${startCursor} -> ${meta.cursor}`,
  });
  return { kind: 'complete' };
}

/** What one pulled record did. `failed` is the write refusing, which parks the pull where it is. */
type ApplyResult = 'wrote' | 'skipped' | 'failed';

async function applyPulledRecord(
  deps: CycleDeps,
  meta: SyncMeta,
  rec: SyncRecord,
  warnedUnknownCollections: Set<string>
): Promise<ApplyResult> {
  const key = SyncMetadataStore.entityKey(rec.collection, rec.entityId);

  let incoming: RecordBody;
  try {
    incoming = (await fromSyncRecord(deps.dk, rec)).body;
  } catch (err) {
    if (!(err instanceof DecryptError || err instanceof EnvelopeParseError)) {
      throw err;
    }
    if (!meta.quarantine.includes(key)) {
      meta.quarantine.push(key);
      deps.onQuarantine?.(key);
      // Metadata only — collection/entityId/seq — never the ciphertext or decoded payload.
      logger.warn('Quarantined undecryptable sync record', {
        collection: rec.collection,
        entityId: rec.entityId,
        seq: rec.seq,
      });
    }
    advanceCursor(meta, rec.seq);
    return 'skipped';
  }

  // Decrypt succeeded: a previously-quarantined key has recovered (spec §5.3 self-heal).
  if (meta.quarantine.includes(key)) {
    meta.quarantine = meta.quarantine.filter((q) => q !== key);
  }

  const binding = deps.bindings.find((b) => b.name === rec.collection);
  if (binding === undefined) {
    if (!warnedUnknownCollections.has(rec.collection)) {
      warnedUnknownCollections.add(rec.collection);
      logger.warn('Skipping pulled records for unknown collection', {
        collection: rec.collection,
      });
    }
    advanceCursor(meta, rec.seq);
    return 'skipped';
  }

  const all = await binding.readAll();
  const localEntity = all[rec.entityId];
  const localHlc = meta.hlcs[key];
  // No hlc means this key is unknown to the engine (e.g. legacy pre-sync data) even if an
  // entity exists locally — treat it as null so incoming always wins, per union-migration intent.
  const local: RecordBody | null =
    localHlc === undefined ? null : { entity: localEntity ?? null, hlc: localHlc };

  const resolution = deps.strategy.resolve(local, incoming);
  if (resolution.winner === 'incoming') {
    const res = await binding.writeOne(rec.entityId, resolution.body.entity);
    if (!res.success) {
      // Without this, a wedged pull (e.g. persistent quota) is undiagnosable —
      // nothing else connects "cursor stalled at seq N" to the failing write.
      logger.error('Pull-cycle write failed; stopping before advancing the cursor', {
        collection: rec.collection,
        entityId: rec.entityId,
        seq: rec.seq,
        error: res.error,
      });
      return 'failed';
    }
    meta.hlcs[key] = resolution.body.hlc;
    meta.clock = hlcEncode(
      hlcReceive(hlcDecode(meta.clock), hlcDecode(resolution.body.hlc), (deps.now ?? Date.now)())
    );
    if (resolution.body.entity === null) {
      if (!meta.tombstones.includes(key)) {
        meta.tombstones.push(key);
      }
    } else {
      meta.tombstones = meta.tombstones.filter((t) => t !== key);
    }
  }

  advanceCursor(meta, rec.seq);
  return resolution.winner === 'incoming' ? 'wrote' : 'skipped';
}

// The server-issued cursor only moves forward — a backward value is dropped, not applied.
function advanceCursor(meta: SyncMeta, seq: number): void {
  if (seq > meta.cursor) {
    meta.cursor = seq;
  } else {
    logger.warn('Rejected backward sync cursor', { seq, cursor: meta.cursor });
  }
}
