import { problem } from './problems';

interface JsonRequestContext {
  req: { json: () => Promise<unknown> };
}

/** Parses the request body as JSON; returns the invalid_request problem Response on failure. */
export async function parseJsonBody(c: JsonRequestContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return problem('invalid_request', { detail: 'Body must be JSON.' });
  }
}
