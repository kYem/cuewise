// Shared helpers for the server-bounce route tests (apple-auth.test.ts, google-auth.test.ts).

// Fixed 43-char base64url verifiers; no randomness needed for PKCE binding tests.
export const TEST_CODE_VERIFIER = 'a'.repeat(43);
export const WRONG_CODE_VERIFIER = 'b'.repeat(43);

export interface DecodedBounceState {
  returnUri: string;
  codeChallenge: string;
  nonce: string;
}

/** Reads the plaintext payload of a `signState` output; does not verify the signature. */
export function decodeState(state: string): DecodedBounceState {
  const body = state.slice(0, state.lastIndexOf('.'));
  return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
}

export function requireHeader(res: Response, name: string): string {
  const value = res.headers.get(name);
  if (value === null) {
    throw new Error(`Expected a ${name} header on response with status ${res.status}`);
  }
  return value;
}
