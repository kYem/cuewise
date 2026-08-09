import { EnvelopeParseError } from './errors';

// Framing, not a primitive: this is the alphabet every envelope and wire-carried key is written
// in, so it stays public and outside the swappable WebCrypto seam.

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
