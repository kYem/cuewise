// Every WebCrypto touch lives here so a runtime without crypto.subtle (pending
// Tauri probe) can swap in a pure-JS backend by replacing this one file.
import { DecryptError, EnvelopeParseError } from './errors';

const subtle = globalThis.crypto.subtle;

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
  return new Uint8Array(await subtle.digest('SHA-256', asBufferSource(data)));
}

export async function hkdfSha256(
  ikm: Uint8Array,
  info: string,
  lengthBits: number
): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', asBufferSource(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
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

async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
  return subtle.importKey('raw', asBufferSource(key), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function aesGcmSeal(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await importAesKey(key);
  const sealed = await subtle.encrypt(
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
  try {
    const opened = await subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv), additionalData: asBufferSource(aad) },
      cryptoKey,
      asBufferSource(ciphertext)
    );
    return new Uint8Array(opened);
  } catch {
    // WebCrypto throws an opaque OperationError; surface our typed error with no payload data.
    throw new DecryptError();
  }
}

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
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
  } catch {
    throw new EnvelopeParseError('invalid base64url payload');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
