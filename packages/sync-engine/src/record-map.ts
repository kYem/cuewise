import { type DataKey, openRecord, sealRecord } from '@cuewise/crypto';
import { hlcDecode, type PushRecord, type SyncRecord } from '@cuewise/shared';
import type { RecordBody } from './strategy';

/** Seals the full body (including tombstones) so its HLC survives for delete-vs-edit LWW. */
export async function toPushRecord(
  dk: DataKey,
  keyId: string,
  collection: string,
  entityId: string,
  body: RecordBody
): Promise<PushRecord> {
  const ciphertext = await sealRecord(dk, keyId, collection, entityId, JSON.stringify(body));
  return {
    collection,
    entityId,
    ciphertext,
    clientUpdatedAt: hlcDecode(body.hlc).physical,
    deleted: body.entity === null,
  };
}

// openRecord's DecryptError/EnvelopeParseError propagate — the pull cycle quarantines, not us.
export async function fromSyncRecord(dk: DataKey, rec: SyncRecord): Promise<{ body: RecordBody }> {
  const plaintext = await openRecord(dk, rec.ciphertext, rec.collection, rec.entityId);
  return { body: JSON.parse(plaintext) as RecordBody };
}
