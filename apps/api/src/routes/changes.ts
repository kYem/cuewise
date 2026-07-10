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
    const since = Number.parseInt(raw, 10);
    if (Number.isNaN(since) || since < 0) {
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
