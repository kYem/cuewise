import { RecoveryCodeError } from './errors';
import { randomBytes, sha256, utf8 } from './primitives';

// Crockford base32: no I, L, O, U — survives handwriting and re-typing.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const VERSION = 'CW1';
const SECRET_CHARS = 30; // 150 bits of entropy; the canonical secret IS this string
const CHECKSUM_CHARS = 5;

// Branded so the compiler rejects passing the display code where the HKDF input belongs —
// deriveMasterKey(rc.code) would silently wrap with the wrong key and break recovery.
export type RecoverySecret = string & { readonly __brand: 'RecoverySecret' };

export interface RecoveryCode {
  code: string;
  secret: RecoverySecret;
}

async function checksumOf(secret: string): Promise<string> {
  const digest = await sha256(utf8(secret));
  let out = '';
  // First 25 bits of the digest as 5 Crockford chars (5 bits each).
  for (let i = 0; i < CHECKSUM_CHARS; i += 1) {
    const bitOffset = i * 5;
    const byteIndex = Math.floor(bitOffset / 8);
    const bits =
      ((digest[byteIndex] << 8) | (digest[byteIndex + 1] ?? 0)) >> (11 - (bitOffset % 8));
    out += ALPHABET[bits & 31];
  }
  return out;
}

function groupsOf5(s: string): string {
  const groups: string[] = [];
  for (let i = 0; i < s.length; i += 5) {
    groups.push(s.slice(i, i + 5));
  }
  return groups.join('-');
}

export async function generateRecoveryCode(): Promise<RecoveryCode> {
  const bytes = randomBytes(SECRET_CHARS);
  let secret = '';
  for (const b of bytes) {
    secret += ALPHABET[b & 31];
  }
  const code = `${VERSION}-${groupsOf5(secret + (await checksumOf(secret)))}`;
  return { code, secret: secret as RecoverySecret };
}

export async function parseRecoveryCode(input: string): Promise<RecoverySecret> {
  const cleaned = input
    .toUpperCase()
    .replaceAll(/[^0-9A-Z]/g, '')
    .replaceAll('O', '0')
    .replaceAll(/[IL]/g, '1');
  if (!cleaned.startsWith(VERSION)) {
    if (/^CW\d/.test(cleaned)) {
      throw new RecoveryCodeError('version', 'unsupported recovery code version');
    }
    throw new RecoveryCodeError('format', 'not a recovery code');
  }
  const body = cleaned.slice(VERSION.length);
  if (body.length !== SECRET_CHARS + CHECKSUM_CHARS) {
    throw new RecoveryCodeError('format', 'wrong recovery code length');
  }
  for (const ch of body) {
    if (!ALPHABET.includes(ch)) {
      throw new RecoveryCodeError('format', 'invalid recovery code character');
    }
  }
  const secret = body.slice(0, SECRET_CHARS);
  const checksum = body.slice(SECRET_CHARS);
  if ((await checksumOf(secret)) !== checksum) {
    throw new RecoveryCodeError('checksum', 'recovery code checksum mismatch');
  }
  return secret as RecoverySecret;
}
