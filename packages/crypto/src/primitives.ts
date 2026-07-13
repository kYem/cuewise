// Every WebCrypto touch lives here as a swappable backend seam. All current targets have
// crypto.subtle (probed in the bundled Tauri app: tauri://localhost is a secure context).
import { DecryptError, EnvelopeParseError } from './errors';

// Lazy so a runtime without WebCrypto fails at first use with a clear message (not at import,
// and not as an opaque TypeError mid-crypto) — the seam a future non-WebCrypto backend replaces.
function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error('crypto.subtle is unavailable in this runtime; E2E crypto requires WebCrypto');
  }
  return subtle;
}

const KEY_ID_RE = /^dk-\d+$/;

// TS's Uint8Array is generic over its backing buffer (ArrayBuffer | SharedArrayBuffer); DOM's
// BufferSource requires the ArrayBuffer-only form, which a bare `Uint8Array` param can't express.
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as BufferSource;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await getSubtle().digest('SHA-256', asBufferSource(data)));
}

export async function hkdfSha256(
  ikm: Uint8Array,
  info: string,
  lengthBits: number
): Promise<Uint8Array> {
  const key = await getSubtle().importKey('raw', asBufferSource(ikm), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await getSubtle().deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: asBufferSource(new Uint8Array(32)),
      info: asBufferSource(utf8(info)),
    },
    key,
    lengthBits
  );
  return new Uint8Array(bits);
}

const aesKeyCache = new WeakMap<Uint8Array, Promise<CryptoKey>>();

// Caches by Uint8Array reference to skip re-importing the same data key across records.
// Shares crypto-utils.ts's evict-on-rejection idea, not its single-slot equality cache.
async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
  const cached = aesKeyCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const imported = getSubtle().importKey('raw', asBufferSource(key), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  // Evict on rejection — a cached rejected promise would poison every later call with this key.
  const guarded = imported.catch((err) => {
    aesKeyCache.delete(key);
    throw err;
  });
  aesKeyCache.set(key, guarded);
  return guarded;
}

export async function aesGcmSeal(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await importAesKey(key);
  const sealed = await getSubtle().encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv), additionalData: asBufferSource(aad) },
    cryptoKey,
    asBufferSource(plaintext)
  );
  return new Uint8Array(sealed);
}

export async function aesGcmOpen(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  aad: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await importAesKey(key);
  // Resolve subtle before the try so a missing-WebCrypto error surfaces as itself, not a DecryptError
  // (importAesKey may have been cached, skipping its own getSubtle call).
  const subtle = getSubtle();
  try {
    const opened = await subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv), additionalData: asBufferSource(aad) },
      cryptoKey,
      asBufferSource(ciphertext)
    );
    return new Uint8Array(opened);
  } catch (err) {
    // WebCrypto throws an opaque OperationError; surface our typed error with no payload data,
    // keeping the original as `cause` (only carries err.name/stack, no key material).
    throw new DecryptError(undefined, { cause: err });
  }
}

const CHUNK_SIZE = 0x8000;

export function b64urlEncode(bytes: Uint8Array): string {
  // Chunked: spreading a large typed array into String.fromCharCode blows the call-stack limit.
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function b64urlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) {
    throw new EnvelopeParseError('invalid base64url characters');
  }
  const base64 = s.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch (err) {
    throw new EnvelopeParseError('invalid base64url payload', { cause: err });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isValidKeyId(keyId: string): boolean {
  return KEY_ID_RE.test(keyId);
}

/** Shared `v1.<keyId>.<iv>.<ct>` parser used by both record envelopes and wrapped-key blobs. */
export function splitEnvelope(value: string): { keyId: string; iv: Uint8Array; ct: Uint8Array } {
  const parts = value.split('.');
  if (parts.length !== 4) {
    throw new EnvelopeParseError('envelope must have 4 parts');
  }
  const [version, keyId, ivPart, ctPart] = parts;
  if (version !== 'v1') {
    throw new EnvelopeParseError('unknown envelope version');
  }
  if (!isValidKeyId(keyId)) {
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
  return { keyId, iv, ct };
}
