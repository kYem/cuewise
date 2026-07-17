// RFC 7636 S256 PKCE pair for the Google server-bounce sign-in. The verifier is generated
// on-device and never leaves it until the final token exchange; only the challenge (its
// SHA-256) rides the /start URL.

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 32 random bytes → 43 base64url chars, inside RFC 7636 §4.1's 43-128 range. */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** S256: base64url(sha256(verifier)) — what the server stores on the minted one-time code. */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}
