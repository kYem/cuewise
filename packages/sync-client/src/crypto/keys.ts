import { EnvelopeParseError } from './errors';
import {
  aesGcmOpen,
  aesGcmSeal,
  b64urlEncode,
  hkdfSha256,
  isValidKeyId,
  randomBytes,
  splitEnvelope,
  utf8,
} from './primitives';

const MK_INFO = 'cuewise-mk-v1';
const WRAP_AAD = 'v1|recovery';

export async function deriveMasterKey(secret: string): Promise<Uint8Array> {
  return hkdfSha256(utf8(secret), MK_INFO, 256);
}

export function generateDataKey(): Uint8Array {
  return randomBytes(32);
}

// Bind the keyId into the AAD alongside the fixed context so a swapped header fails to open.
function wrapAad(keyId: string): Uint8Array {
  return utf8(`${WRAP_AAD}|${keyId}`);
}

export async function wrapDataKey(mk: Uint8Array, dk: Uint8Array, keyId: string): Promise<string> {
  if (!isValidKeyId(keyId)) {
    throw new EnvelopeParseError('invalid keyId');
  }
  const iv = randomBytes(12);
  const ct = await aesGcmSeal(mk, iv, dk, wrapAad(keyId));
  return `v1.${keyId}.${b64urlEncode(iv)}.${b64urlEncode(ct)}`;
}

export async function unwrapDataKey(
  mk: Uint8Array,
  blob: string
): Promise<{ dk: Uint8Array; keyId: string }> {
  const { keyId, iv, ct } = splitEnvelope(blob);
  const dk = await aesGcmOpen(mk, iv, ct, wrapAad(keyId));
  return { dk, keyId };
}
