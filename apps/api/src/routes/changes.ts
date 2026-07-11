import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import type { AppDepsResolved } from '../index';
import { problem } from '../problems';
import { validatePushBody } from '../validate-changes';

export function registerChangesRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.get('/v1/changes', async (c) => {
    const raw = c.req.query('since') ?? '';
    // Number.parseInt tolerates trailing junk ("123abc") and scientific notation ("1e5");
    // require plain digits so a malformed cursor 400s instead of silently returning the wrong window.
    if (!/^\d+$/.test(raw)) {
      return problem('invalid_cursor');
    }
    // Bound the digit count before parsing so an absurdly long numeral can't be used
    // to probe parser behavior, then reject anything past Number's safe integer range.
    if (raw.length > 15) {
      return problem('invalid_cursor');
    }
    const since = Number.parseInt(raw, 10);
    if (!Number.isSafeInteger(since)) {
      return problem('invalid_cursor');
    }
    const store = deps.storeFactory(c.env.DB);
    const { records, cursor } = await store.listChanges(c.get('userId'), since);
    return c.json({ records, cursor });
  });

  app.post('/v1/changes', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return problem('invalid_request', { detail: 'Body must be JSON.' });
    }
    const parsed = validatePushBody(raw);
    if ('problemCode' in parsed) {
      return problem(parsed.problemCode, { errors: parsed.issues });
    }
    const store = deps.storeFactory(c.env.DB);
    const cursor = await store.applyChanges(c.get('userId'), parsed.records);
    return c.json({ cursor });
  });
}
