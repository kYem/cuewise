import { EnvelopeParseError } from './errors';
import {
  aesGcmOpen,
  aesGcmSeal,
  b64urlDecode,
  b64urlEncode,
  hkdfSha256,
  randomBytes,
  utf8,
} from './primitives';

const MK_INFO = 'cuewise-mk-v1';
const WRAP_AAD = 'v1|recovery';
const KEY_ID_RE = /^dk-\d+$/;

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
  if (!KEY_ID_RE.test(keyId)) {
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
  const parts = blob.split('.');
  if (parts.length !== 4) {
    throw new EnvelopeParseError('wrapped key blob must have 4 parts');
  }
  const [version, keyId, ivPart, ctPart] = parts;
  if (version !== 'v1') {
    throw new EnvelopeParseError('unknown wrapped key version');
  }
  if (!KEY_ID_RE.test(keyId)) {
    throw new EnvelopeParseError('invalid keyId');
  }
  const iv = b64urlDecode(ivPart);
  const ct = b64urlDecode(ctPart);
  if (iv.length !== 12) {
    throw new EnvelopeParseError('invalid iv length');
  }
  const dk = await aesGcmOpen(mk, iv, ct, wrapAad(keyId));
  return { dk, keyId };
}
