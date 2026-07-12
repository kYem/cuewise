import { problem } from './problem-details';

// ~MAX_BATCH_SIZE x MAX_CIPHERTEXT_BYTES plus overhead. Rejecting on Content-Length stops an
// oversized body from being buffered into memory (OOMing the isolate) before batch validation.
export const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;

interface JsonRequestContext {
  req: {
    json: () => Promise<unknown>;
    header: (name: string) => string | undefined;
  };
}

/** Parses the request body as JSON; returns a problem Response on an oversized or non-JSON body. */
export async function parseJsonBody(c: JsonRequestContext): Promise<unknown> {
  const declaredLength = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return problem('payload_too_large', { detail: 'Request body is too large.' });
  }
  try {
    return await c.req.json();
  } catch {
    return problem('invalid_request', { detail: 'Body must be JSON.' });
  }
}
