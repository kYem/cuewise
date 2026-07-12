import { EnvelopeParseError } from './errors';
import {
  aesGcmOpen,
  aesGcmSeal,
  b64urlEncode,
  isValidKeyId,
  randomBytes,
  splitEnvelope,
  utf8,
} from './primitives';

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
  dk: Uint8Array,
  keyId: string,
  collection: string,
  entityId: string,
  plaintext: string
): Promise<string> {
  assertValidAadComponent(collection);
  assertValidAadComponent(entityId);
  if (!isValidKeyId(keyId)) {
    throw new EnvelopeParseError('invalid keyId');
  }
  const iv = randomBytes(12);
  const ct = await aesGcmSeal(dk, iv, utf8(plaintext), recordAad(collection, entityId));
  return `v1.${keyId}.${b64urlEncode(iv)}.${b64urlEncode(ct)}`;
}

export async function openRecord(
  dk: Uint8Array,
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
