import type { DataKey } from '@cuewise/crypto';
import type { KeyValueStore, SyncRecord } from '@cuewise/shared';
import type { CycleDeps } from '../cycle';
import { loadPersistedDataKey } from '../key-lifecycle';
import { SyncMetadataStore } from '../metadata-store';
import { toPushRecord } from '../record-map';
import type { RecordBody } from '../strategy';
import type { FakeSyncServer } from './fake-api-client';
import type { FakeTransport } from './fake-transport';

/** Seals a body under the given key and stamps it with a seq, as a server row would carry. */
export async function sealServerRecord(
  dk: DataKey,
  keyId: string,
  collection: string,
  entityId: string,
  body: RecordBody,
  seq: number
): Promise<SyncRecord> {
  const pushRecord = await toPushRecord(dk, keyId, collection, entityId, body);
  return { ...pushRecord, seq };
}

/** Seeds the row the server already holds for an entity, sealed under the cycle's own key. */
export async function seedServerRow(
  transport: FakeTransport,
  deps: Pick<CycleDeps, 'dk' | 'keyId'>,
  collection: string,
  entityId: string,
  body: RecordBody,
  seq: number
): Promise<SyncRecord> {
  const row = await sealServerRecord(deps.dk, deps.keyId, collection, entityId, body, seq);
  transport.serverRecords.set(SyncMetadataStore.entityKey(collection, entityId), row);
  return row;
}

/**
 * Lands a body on the fake server the way a client that predates compare-and-set would: sealed
 * under the key persisted in `kv`, with no base, so it overwrites whatever row is there.
 */
export async function pushWithoutBase(
  kv: KeyValueStore,
  server: FakeSyncServer,
  collection: string,
  entityId: string,
  body: RecordBody
): Promise<number> {
  const stored = await loadPersistedDataKey(kv);
  if (stored === null) {
    throw new Error('expected a persisted data key');
  }
  const record = await toPushRecord(stored.dk, stored.keyId, collection, entityId, body);
  const seq = server.pushChanges([record]).applied[0]?.seq;
  if (seq === undefined) {
    throw new Error(`expected ${collection}/${entityId} to land`);
  }
  return seq;
}
