import { EnvelopeParseError } from './errors';
import {
  aesGcmOpen,
  aesGcmSeal,
  b64urlDecode,
  b64urlEncode,
  randomBytes,
  utf8,
} from './primitives';

const KEY_ID_RE = /^dk-\d+$/;

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
  if (!KEY_ID_RE.test(keyId)) {
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
  const parts = envelope.split('.');
  if (parts.length !== 4) {
    throw new EnvelopeParseError('record envelope must have 4 parts');
  }
  const [version, keyId, ivPart, ctPart] = parts;
  if (version !== 'v1') {
    throw new EnvelopeParseError('unknown envelope version');
  }
  if (!KEY_ID_RE.test(keyId)) {
    throw new EnvelopeParseError('invalid keyId');
  }
  const iv = b64urlDecode(ivPart);
  const ct = b64urlDecode(ctPart);
  if (iv.length !== 12) {
    throw new EnvelopeParseError('invalid iv length');
  }
  // 16-byte GCM tag is the minimum possible payload.
  if (ct.length < 16) {
    throw new EnvelopeParseError('ciphertext too short');
  }
  const opened = await aesGcmOpen(dk, iv, ct, recordAad(collection, entityId));
  return new TextDecoder().decode(opened);
}
