import { EnvelopeParseError } from './errors';
import type { DataKey } from './keys';
import { aesGcmOpen, sealEnvelope, splitEnvelope, utf8 } from './primitives';

// Reject before building any AAD: an unescaped `|` lets ('a|b','c') and ('a','b|c')
// serialize to the identical AAD string, so either could open the other's ciphertext.
function assertValidAadComponent(value: string): void {
  if (value === '' || value.includes('|')) {
    throw new EnvelopeParseError('invalid aad component');
  }
}

function recordAad(collection: string, entityId: string): Uint8Array {
  return utf8(`v1|${collection}|${entityId}`);
}

export async function sealRecord(
  dk: DataKey,
  keyId: string,
  collection: string,
  entityId: string,
  plaintext: string
): Promise<string> {
  assertValidAadComponent(collection);
  assertValidAadComponent(entityId);
  return sealEnvelope(dk, keyId, utf8(plaintext), recordAad(collection, entityId));
}

export async function openRecord(
  dk: DataKey,
  envelope: string,
  collection: string,
  entityId: string
): Promise<string> {
  assertValidAadComponent(collection);
  assertValidAadComponent(entityId);
  const { iv, ct } = splitEnvelope(envelope);
  const opened = await aesGcmOpen(dk, iv, ct, recordAad(collection, entityId));
  return new TextDecoder().decode(opened);
}
