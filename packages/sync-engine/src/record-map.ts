import { type DataKey, EnvelopeParseError, openRecord, sealRecord } from '@cuewise/crypto';
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

// DecryptError/EnvelopeParseError (from openRecord or the parse below) propagate — the pull
// cycle quarantines, not us.
export async function fromSyncRecord(dk: DataKey, rec: SyncRecord): Promise<{ body: RecordBody }> {
  const plaintext = await openRecord(dk, rec.ciphertext, rec.collection, rec.entityId);
  return { body: parseRecordBody(plaintext) };
}

// A decrypted-but-malformed payload (e.g. a future payload version an older device can't read,
// per the Swappability section) is an envelope-parse failure conceptually, not a crash — never
// include the payload itself in the thrown message.
function parseRecordBody(plaintext: string): RecordBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch (err) {
    throw new EnvelopeParseError('decrypted payload is not valid JSON', { cause: err });
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as RecordBody).hlc !== 'string' ||
    !('entity' in parsed)
  ) {
    throw new EnvelopeParseError('decrypted payload has an unexpected shape');
  }
  return parsed as RecordBody;
}
