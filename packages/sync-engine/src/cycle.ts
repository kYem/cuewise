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

/** Seals every dirty entity and pushes it in batches, clearing dirty/tombstones as each batch acks. */
export async function pushOnce(deps: CycleDeps): Promise<void> {
  const meta = await deps.meta.load();
  const dirtyRecords = await buildDirtyRecords(deps, meta);
  if (dirtyRecords.length === 0) {
    return;
  }

  for (let start = 0; start < dirtyRecords.length; start += MAX_PUSH_BATCH) {
    const batch = dirtyRecords.slice(start, start + MAX_PUSH_BATCH);
    await deps.transport.pushChanges(batch.map((item) => item.record));
    clearAcked(meta, batch);
    await deps.meta.save(meta);
  }
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

/** Pulls remote changes in seq order, resolves each via the strategy, and applies the winners. */
export async function pullOnce(deps: CycleDeps): Promise<void> {
  const meta = await deps.meta.load();
  // Once per collection per pull — a page of unknown records is one line, not N.
  const warnedUnknownCollections = new Set<string>();

  let pageSize = PULL_PAGE;
  while (pageSize === PULL_PAGE) {
    let result: { records: SyncRecord[]; cursor: number };
    try {
      result = await deps.transport.getChanges(meta.cursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'resync_required') {
        meta.cursor = 0;
        await deps.meta.save(meta);
        return;
      }
      throw err;
    }
    pageSize = result.records.length;

    for (const rec of result.records) {
      const applied = await applyPulledRecord(deps, meta, rec, warnedUnknownCollections);
      if (!applied) {
        // Apply-before-advance: the write failed, so stop here and leave the cursor before it.
        await deps.meta.save(meta);
        return;
      }
    }
  }

  await deps.meta.save(meta);
}

/** Applies one pulled record to meta/storage. Returns false to signal "stop the cycle here". */
async function applyPulledRecord(
  deps: CycleDeps,
  meta: SyncMeta,
  rec: SyncRecord,
  warnedUnknownCollections: Set<string>
): Promise<boolean> {
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
    return true;
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
    return true;
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
      return false;
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
  return true;
}

// The server-issued cursor only moves forward — a backward value is dropped, not applied.
function advanceCursor(meta: SyncMeta, seq: number): void {
  if (seq > meta.cursor) {
    meta.cursor = seq;
  } else {
    logger.warn('Rejected backward sync cursor', { seq, cursor: meta.cursor });
  }
}
