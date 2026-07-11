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

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function importHmacKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Signs `payload` so `verifyState` can detect any tampering with the body or signature. */
export async function signState(payload: object, key: string): Promise<string> {
  const body = base64UrlEncodeString(JSON.stringify(payload));
  const cryptoKey = await importHmacKey(key);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Verifies a `signState` output with a constant-time comparison; never throws. */
export async function verifyState(state: string, key: string): Promise<unknown | null> {
  const separator = state.lastIndexOf('.');
  if (separator === -1) {
    return null;
  }
  const body = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  try {
    const cryptoKey = await importHmacKey(key);
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
      return null;
    }
    return JSON.parse(base64UrlDecodeString(body));
  } catch {
    return null;
  }
}
