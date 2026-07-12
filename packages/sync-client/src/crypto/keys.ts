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

// Branded so the compiler catches a swapped mk/dk argument at compile time, mirroring
// RawSessionToken/SessionTokenHash in apps/api/src/crypto-utils.ts.
export type MasterKey = Uint8Array & { readonly __brand: 'MasterKey' };
export type DataKey = Uint8Array & { readonly __brand: 'DataKey' };

export async function deriveMasterKey(secret: string): Promise<MasterKey> {
  return (await hkdfSha256(utf8(secret), MK_INFO, 256)) as MasterKey;
}

export function generateDataKey(): DataKey {
  return randomBytes(32) as DataKey;
}

// Bind the keyId into the AAD alongside the fixed context so a swapped header fails to open.
function wrapAad(keyId: string): Uint8Array {
  return utf8(`${WRAP_AAD}|${keyId}`);
}

export async function wrapDataKey(mk: MasterKey, dk: DataKey, keyId: string): Promise<string> {
  if (!isValidKeyId(keyId)) {
    throw new EnvelopeParseError('invalid keyId');
  }
  const iv = randomBytes(12);
  const ct = await aesGcmSeal(mk, iv, dk, wrapAad(keyId));
  return `v1.${keyId}.${b64urlEncode(iv)}.${b64urlEncode(ct)}`;
}

export async function unwrapDataKey(
  mk: MasterKey,
  blob: string
): Promise<{ dk: DataKey; keyId: string }> {
  const { keyId, iv, ct } = splitEnvelope(blob);
  const dk = await aesGcmOpen(mk, iv, ct, wrapAad(keyId));
  return { dk: dk as DataKey, keyId };
}
