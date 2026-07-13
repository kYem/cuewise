import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
import type { AppDepsResolved } from '../index';
import { problem, requireNonEmptyString, type ValidationIssue } from '../problem-details';

// Client-wrapped key blobs are small; anything bigger is malformed or abusive.
const MAX_ENVELOPE_BYTES = 1024;

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
    const ifAbsent = (raw as { ifAbsent?: unknown }).ifAbsent === true;
    const issues: ValidationIssue[] = [];
    requireNonEmptyString(envelope, '/envelope', issues, { maxLength: MAX_ENVELOPE_BYTES });
    // The typeof re-check only narrows for TS; requireNonEmptyString owns the actual rule.
    if (typeof envelope !== 'string' || issues.length > 0) {
      return problem('invalid_key_envelope', { errors: issues });
    }
    const store = deps.storeFactory(c.env.DB);
    if (ifAbsent) {
      const created = await store.putKeyEnvelopeIfAbsent(c.get('userId'), 'recovery', envelope);
      if (!created) {
        return problem('key_envelope_exists');
      }
      return c.body(null, 204);
    }
    await store.putKeyEnvelope(c.get('userId'), 'recovery', envelope);
    return c.body(null, 204);
  });
}
