import { logger } from '@cuewise/shared';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlDecode(value: string): string {
  return atob(value.replace(/-/g, '+').replace(/_/g, '/'));
}

/** UTF-8 safe string variant: charCodeAt-based encoding silently truncates code points > 255. */
export function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(encoder.encode(value));
}

export function base64UrlDecodeString(value: string): string {
  const binary = base64UrlDecode(value);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return decoder.decode(bytes);
}

export function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Branded so the compiler keeps the raw session token (returned once) and its stored SHA-256
// apart: passing a hash where a raw token belongs (or vice versa) is then a compile error.
export type RawSessionToken = string & { readonly __brand: 'RawSessionToken' };
export type SessionTokenHash = string & { readonly __brand: 'SessionTokenHash' };

export function randomSessionToken(): RawSessionToken {
  return randomToken() as RawSessionToken;
}

export async function hashSessionToken(raw: RawSessionToken): Promise<SessionTokenHash> {
  return (await sha256Hex(raw)) as SessionTokenHash;
}

/** The one blessed cast of untrusted input: parses `Authorization: Bearer <token>`, or null if absent/empty/malformed. */
export function bearerToken(header: string | undefined): RawSessionToken | null {
  if (header === undefined || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  // An empty or whitespace-only token is not a credential — reject rather than hash-and-miss.
  if (token.trim() === '') {
    return null;
  }
  return token as RawSessionToken;
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

let cachedKey: { raw: string; key: Promise<CryptoKey> } | null = null;

// STATE_SIGNING_KEY is effectively constant per isolate; caching avoids re-importing the
// same HMAC key on every signState/verifyState call (every Apple /start and /callback).
function importHmacKey(key: string): Promise<CryptoKey> {
  if (cachedKey !== null && cachedKey.raw === key) {
    return cachedKey.key;
  }
  const entry = {
    raw: key,
    key: crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    ),
  };
  cachedKey = entry;
  // Never cache a rejection: a transient import failure must not permanently poison this
  // slot for the isolate's lifetime. Only clear it if a newer entry hasn't already replaced it.
  entry.key.catch(() => {
    if (cachedKey === entry) {
      cachedKey = null;
    }
  });
  return entry.key;
}

/** Signs `payload` so `verifyState` can detect any tampering with the body or signature. */
export async function signState(payload: object, key: string): Promise<string> {
  const body = base64UrlEncodeString(JSON.stringify(payload));
  const cryptoKey = await importHmacKey(key);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Discriminates why verification failed so callers can tell a server fault from a bad client. */
export type VerifyStateResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: 'unsigned' | 'bad_signature' | 'undecodable' | 'key_unavailable' };

/** Verifies a `signState` output; never throws. The HMAC compare is constant-time on workerd
 *  (BoringSSL CRYPTO_memcmp), a runtime property — not a WebCrypto-spec guarantee off-workerd. */
export async function verifyState(state: string, key: string): Promise<VerifyStateResult> {
  const separator = state.lastIndexOf('.');
  if (separator === -1) {
    // Our own /start always emits a signed state; an unsigned one is necessarily forged.
    logger.warn('verifyState: state is not signed');
    return { ok: false, reason: 'unsigned' };
  }
  const body = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importHmacKey(key);
  } catch (err) {
    // A key-import failure is a server misconfiguration (bad key material, crypto fault),
    // not attacker input — must be loud, not folded into the decode-failure warn below.
    logger.error('verifyState: HMAC key import failed', err);
    return { ok: false, reason: 'key_unavailable' };
  }
  try {
    const signatureBytes = Uint8Array.from(base64UrlDecode(signature), (ch) => ch.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureBytes,
      encoder.encode(body)
    );
    if (!valid) {
      // A forged/tampered state is the exact attack this HMAC exists to stop; it must be visible.
      logger.warn('verifyState: HMAC signature verification failed');
      return { ok: false, reason: 'bad_signature' };
    }
    return { ok: true, payload: JSON.parse(base64UrlDecodeString(body)) };
  } catch {
    // A state we issued always decodes cleanly; anything that throws here wasn't ours.
    logger.warn('verifyState: state could not be decoded');
    return { ok: false, reason: 'undecodable' };
  }
}
