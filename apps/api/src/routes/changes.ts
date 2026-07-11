import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
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
    // isSafeInteger rejects both ends on its own: Number() overflows a huge numeral to
    // Infinity, and it rounds anything past 2^53 to a value outside the safe-integer range.
    const since = Number(raw);
    if (!Number.isSafeInteger(since)) {
      return problem('invalid_cursor');
    }
    const store = deps.storeFactory(c.env.DB);
    const { records, cursor } = await store.listChanges(c.get('userId'), since);
    return c.json({ records, cursor });
  });

  app.post('/v1/changes', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
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
