import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
import type { AppDepsResolved } from '../index';
import { problem } from '../problem-details';

// Client-wrapped key blobs are small; anything bigger is malformed or abusive.
const MAX_ENVELOPE_BYTES = 1024;
const encoder = new TextEncoder();

export function registerKeysRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.get('/v1/keys/recovery', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const found = await store.getKeyEnvelope(c.get('userId'), 'recovery');
    if (!found) {
      return problem('not_found', { detail: 'No recovery key envelope for this account.' });
    }
    return c.json(found);
  });

  app.put('/v1/keys/recovery', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
    }
    // `raw` can be JSON `null`, which is typeof 'object' — guard before reading `.envelope`.
    if (raw === null || typeof raw !== 'object') {
      return problem('invalid_key_envelope');
    }
    const envelope = (raw as { envelope?: unknown }).envelope;
    if (
      typeof envelope !== 'string' ||
      envelope.length === 0 ||
      encoder.encode(envelope).length > MAX_ENVELOPE_BYTES
    ) {
      return problem('invalid_key_envelope');
    }
    const store = deps.storeFactory(c.env.DB);
    await store.putKeyEnvelope(c.get('userId'), 'recovery', envelope);
    return c.body(null, 204);
  });
}
