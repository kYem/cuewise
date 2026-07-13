import type { DataKey } from '@cuewise/crypto';
import { logger, type PushRecord, type SyncRecord } from '@cuewise/shared';
import type { CollectionBinding } from './collections';
import { type SyncMeta, SyncMetadataStore } from './metadata-store';
import { toPushRecord } from './record-map';
import type { RecordBody } from './strategy';

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
}

const MAX_PUSH_BATCH = 100;

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
