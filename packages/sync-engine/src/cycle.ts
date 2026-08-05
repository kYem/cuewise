import { type DataKey, DecryptError, EnvelopeParseError } from '@cuewise/crypto';
import {
  hlcCompare,
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

/**
 * One pull's working ledger. `meta` is the snapshot it resolves conflicts against and mutates as
 * records apply; `applied` and `quarantined` name the keys it decided something about, and it may
 * claim each only while the stored ledger has not moved that key on past it meanwhile. Everything
 * else in the stored ledger — above all `dirty` — belongs to whoever wrote it.
 */
interface PullState {
  meta: SyncMeta;
  applied: Set<string>;
  /** Keys whose quarantine membership this pull changed — not merely re-observed. */
  quarantined: Set<string>;
  /** The server discarded this device's cursor, so the merge must rewind it rather than advance. */
  cursorReset: boolean;
}

/** One key's membership in a ledger list, mirrored from what the pull decided for it. */
function withMembership(list: string[], key: string, member: boolean): string[] {
  if (!member) {
    return list.filter((k) => k !== key);
  }
  if (list.includes(key)) {
    return list;
  }
  return [...list, key];
}

/** Applies only what the pull owns onto a freshly-loaded ledger; see PullState. */
function mergePull(fresh: SyncMeta, pull: PullState, wallMs: number): void {
  if (pull.cursorReset) {
    fresh.cursor = 0;
  } else {
    fresh.cursor = Math.max(fresh.cursor, pull.meta.cursor);
  }
  fresh.clock = hlcEncode(hlcReceive(hlcDecode(fresh.clock), hlcDecode(pull.meta.clock), wallMs));
  for (const key of pull.quarantined) {
    fresh.quarantine = withMembership(fresh.quarantine, key, pull.meta.quarantine.includes(key));
  }
  for (const key of pull.applied) {
    const held = fresh.hlcs[key];
    // An edit stamped this key while the pull was in flight, so the pull is the older news of the
    // two. Writing its hlc back would have the next push send that edit under a stamp every peer
    // already holds — LWW ties, and the edit would live on this device alone.
    if (held !== undefined && hlcCompare(hlcDecode(pull.meta.hlcs[key]), hlcDecode(held)) <= 0) {
      continue;
    }
    fresh.hlcs[key] = pull.meta.hlcs[key];
    fresh.tombstones = withMembership(fresh.tombstones, key, pull.meta.tombstones.includes(key));
  }
}

async function savePullUnlessCancelled(deps: CycleDeps, pull: PullState): Promise<boolean> {
  if (deps.isCancelled()) {
    return false;
  }
  // `update` enqueues synchronously, and no await may come between it and the check above: a
  // disable slipping into that gap would reset the ledger first and have this delta restore it.
  await deps.meta.update((fresh) => mergePull(fresh, pull, (deps.now ?? Date.now)()));
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
  /** The hlc that was sealed into `record`; the ack only speaks for that version — see clearAcked. */
  hlc: string;
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
    // After the round trip: the server already holds these records, and that has to be said. The
    // skipped write is belt-and-braces — clearAcked's hlc guard no-ops on a reset ledger anyway.
    if (deps.isCancelled()) {
      logger.error(
        `Cloud sync stopped a push for a disconnected account, but its server had already accepted ${batch.length} records`
      );
      return { kind: 'cancelled' };
    }
    // A delta, not the snapshot above: anything marked dirty during the round trip must survive.
    // Enqueued synchronously after that check, so nothing may await between the two.
    await deps.meta.update((fresh) => clearAcked(fresh, batch));
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
      dirtyRecords.push({ collection, entityId, hlc, record });
    }
  }

  return dirtyRecords;
}

// Clears the pushed ids from dirty (pruning empty collections) and resolves their tombstones. An
// id whose hlc moved during the round trip was re-edited, so the ack does not speak for it.
function clearAcked(meta: SyncMeta, batch: DirtyRecord[]): void {
  for (const { collection, entityId, hlc } of batch) {
    if (meta.hlcs[SyncMetadataStore.entityKey(collection, entityId)] !== hlc) {
      continue;
    }
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
  const pull: PullState = {
    meta: await deps.meta.load(),
    applied: new Set(),
    quarantined: new Set(),
    cursorReset: false,
  };
  // Once per collection per pull — a page of unknown records is one line, not N.
  const warnedUnknownCollections = new Set<string>();
  let appliedCount = 0;
  const startCursor = pull.meta.cursor;
  const appliedCollections: string[] = [];

  let pageSize = PULL_PAGE;
  while (pageSize === PULL_PAGE) {
    if (deps.isCancelled()) {
      return cancelledPull(appliedCount);
    }
    let result: { records: SyncRecord[]; cursor: number };
    try {
      result = await deps.transport.getChanges(pull.meta.cursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'resync_required') {
        pull.meta.cursor = 0;
        pull.cursorReset = true;
        if (!(await savePullUnlessCancelled(deps, pull))) {
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
      const applied = await applyPulledRecord(deps, pull, rec, warnedUnknownCollections);
      if (applied === 'failed') {
        // Apply-before-advance: the write failed, so stop here and leave the cursor before it.
        if (!(await savePullUnlessCancelled(deps, pull))) {
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

  if (!(await savePullUnlessCancelled(deps, pull))) {
    return cancelledPull(appliedCount);
  }
  logger.debug(`Sync pull applied ${appliedCount} record(s)`, {
    byCollection: tallyByCollection(appliedCollections),
    cursor: `${startCursor} -> ${pull.meta.cursor}`,
  });
  return { kind: 'complete' };
}

/** What one pulled record did. `failed` is the write refusing, which parks the pull where it is. */
type ApplyResult = 'wrote' | 'skipped' | 'failed';

async function applyPulledRecord(
  deps: CycleDeps,
  pull: PullState,
  rec: SyncRecord,
  warnedUnknownCollections: Set<string>
): Promise<ApplyResult> {
  const { meta } = pull;
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
      pull.quarantined.add(key);
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
    pull.quarantined.add(key);
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
    pull.applied.add(key);
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
