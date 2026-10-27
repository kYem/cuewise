import {
  aesGcmOpen,
  hkdfSha256,
  randomBytes,
  sealEnvelope,
  splitEnvelope,
  utf8,
} from './primitives';
import type { RecoverySecret } from './recovery-code';

const MK_INFO = 'cuewise-mk-v1';
const WRAP_AAD = 'v1|recovery';

// Branded so the compiler catches a swapped mk/dk argument at compile time, mirroring
// RawSessionToken/SessionTokenHash in apps/api/src/crypto-utils.ts.
export type MasterKey = Uint8Array & { readonly __brand: 'MasterKey' };
export type DataKey = Uint8Array & { readonly __brand: 'DataKey' };

export async function deriveMasterKey(secret: RecoverySecret): Promise<MasterKey> {
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
  return sealEnvelope(mk, keyId, dk, wrapAad(keyId));
}

export async function unwrapDataKey(
  mk: MasterKey,
  blob: string
): Promise<{ dk: DataKey; keyId: string }> {
  const { keyId, iv, ct } = splitEnvelope(blob);
  const dk = await aesGcmOpen(mk, iv, ct, wrapAad(keyId));
  return { dk: dk as DataKey, keyId };
}
