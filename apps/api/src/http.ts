import { problem } from './problem-details';

// An OAuth / Notion error code is enum-shaped. Anything else came from the network and never
// reaches a log line.
export const ERROR_CODE_RE = /^[a-z_]{1,64}$/;

// ~MAX_BATCH_SIZE x MAX_CIPHERTEXT_BYTES plus overhead. Best-effort early reject of an honestly
// declared oversized body; a chunked/under-declared one slips past to the platform body limit.
export const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;

/** Just enough of a Hono context to reach `waitUntil`, without dragging the app's bindings in. */
interface DetachableContext {
  executionCtx: { waitUntil: (work: Promise<unknown>) => void };
}

/**
 * Cleanup the response must not wait for. Without an ExecutionContext — a test driving
 * `app.request` with no ctx — it is awaited instead, because a dropped promise can be cancelled.
 */
export async function detach(c: DetachableContext, work: Promise<unknown>): Promise<void> {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    await work;
  }
}

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
